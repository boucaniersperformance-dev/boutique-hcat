-- ============================================================================
-- Lots offerts au jeu du palet — assouplissement de la règle "1 par match"
-- ============================================================================
-- Constat terrain : les responsables ne créent quasiment jamais de fiche
-- match (ex. 194 ventes sur 4 jours de vente récents, 0 match clôturé). La
-- règle « un lot par match » rendait donc le trophée quasiment inutilisable
-- puisqu'il fallait un match en cours pour l'actionner.
--
-- Ce script modifie le comportement mis en place par lots_palet.sql (à
-- exécuter après lui, pas à sa place) :
--   - le match n'est plus obligatoire ni vérifié : match_id devient
--     optionnel, capturé seulement s'il y a un match en cours au moment du
--     don (simple information, jamais bloquant) ;
--   - un motif texte libre devient obligatoire (ex. « vs Anglet HC »,
--     « Vide-grenier du 12/10 ») pour garder une trace même sans fiche
--     match ;
--   - la limite « une fois par match » devient « une fois par jour
--     calendaire », mais ce n'est plus un blocage dur : si un lot a déjà
--     été offert aujourd'hui, le responsable est juste prévenu et peut
--     continuer quand même (p_forcer = true) s'il a une vraie raison (deux
--     évènements le même jour, par exemple).
--
-- Script autonome et idempotent : à coller en une fois dans l'éditeur SQL
-- de Supabase (après avoir déjà exécuté lots_palet.sql au moins une fois).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table lots_palet : match_id devient optionnel (et ne supprime plus le lot
-- si le match est supprimé), la contrainte "un par match" disparaît, et un
-- motif texte devient obligatoire.
-- ----------------------------------------------------------------------------

alter table lots_palet alter column match_id drop not null;

alter table lots_palet drop constraint if exists lots_palet_match_id_fkey;
alter table lots_palet add constraint lots_palet_match_id_fkey
  foreign key (match_id) references matchs(id) on delete set null;

alter table lots_palet drop constraint if exists lots_palet_un_par_match;

alter table lots_palet add column if not exists motif text;
update lots_palet set motif = 'Motif non renseigné (ancien enregistrement)' where motif is null;
alter table lots_palet alter column motif set not null;

-- ----------------------------------------------------------------------------
-- offrir_lot_palet : signature changée (ajout p_motif, p_forcer) — il faut
-- donc supprimer l'ancienne fonction avant de recréer, sinon Postgres crée
-- une fonction surchargée en plus de l'ancienne au lieu de la remplacer.
--
-- Quand un lot a déjà été offert aujourd'hui et que p_forcer = false, la
-- fonction NE bloque PAS : elle renvoie une ligne avec
-- necessite_confirmation = true (lot_id/cree_le restent nuls, rien n'est
-- enregistré). Le front propose alors de continuer quand même, et rappelle
-- la fonction avec p_forcer = true (le code PIN n'a pas besoin d'être
-- ressaisi : il a déjà été vérifié lors du premier appel).
-- ----------------------------------------------------------------------------

drop function if exists offrir_lot_palet(uuid, text, uuid, jsonb);

create or replace function offrir_lot_palet(
  p_benevole_id uuid,
  p_pin text,
  p_match_id uuid,
  p_motif text,
  p_articles jsonb,
  p_forcer boolean default false
) returns table(lot_id uuid, cree_le timestamptz, necessite_confirmation boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_benevole benevoles%rowtype;
  v_nb_articles integer;
  v_nb_distincts integer;
  v_article jsonb;
  v_produit_id uuid;
  v_taille text;
  v_variante variantes_produit%rowtype;
  v_nom_produit text;
  v_deja_aujourdhui boolean;
begin
  select * into v_benevole from benevoles b
  where b.id = p_benevole_id and b.role = 'responsable' and b.actif = true;
  if not found then
    raise exception 'Action réservée aux responsables';
  end if;

  if v_benevole.pin_hash <> crypt(p_pin, v_benevole.pin_hash) then
    raise exception 'Code PIN incorrect';
  end if;

  if coalesce(trim(p_motif), '') = '' then
    raise exception 'Indique un motif (match ou évènement)';
  end if;

  select count(*) into v_nb_articles from jsonb_array_elements(p_articles);
  if v_nb_articles < 1 or v_nb_articles > 3 then
    raise exception 'Choisis entre 1 et 3 articles';
  end if;

  select count(distinct (elem->>'produit_id') || '|' || coalesce(elem->>'taille', ''))
    into v_nb_distincts
    from jsonb_array_elements(p_articles) elem;
  if v_nb_distincts <> v_nb_articles then
    raise exception 'Les articles choisis doivent être distincts';
  end if;

  select exists(
    select 1 from lots_palet lp where lp.created_at::date = current_date
  ) into v_deja_aujourdhui;

  if v_deja_aujourdhui and not p_forcer then
    necessite_confirmation := true;
    return next;
    return;
  end if;

  insert into lots_palet (match_id, benevole_id, benevole_nom, motif)
  values (p_match_id, p_benevole_id, v_benevole.nom, trim(p_motif))
  returning id, created_at into lot_id, cree_le;

  for v_article in select * from jsonb_array_elements(p_articles)
  loop
    v_produit_id := (v_article->>'produit_id')::uuid;
    v_taille := v_article->>'taille';

    select * into v_variante from variantes_produit vp
    where vp.produit_id = v_produit_id and vp.taille is not distinct from v_taille;
    if not found then
      raise exception 'Article introuvable';
    end if;

    select p.nom into v_nom_produit from produits p where p.id = v_produit_id;
    if v_nom_produit is null then
      raise exception 'Article introuvable';
    end if;

    update variantes_produit
    set stock_qty = stock_qty - 1
    where id = v_variante.id;

    insert into lots_palet_articles (lot_id, produit_id, variante_id, nom_produit, taille)
    values (lot_id, v_produit_id, v_variante.id, v_nom_produit, v_taille);
  end loop;

  necessite_confirmation := false;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- etat_jeu_palet_match : ne dépend plus d'un match (signature changée, donc
-- suppression de l'ancienne avant recréation). Le nombre vendu et
-- l'indicateur « déjà offert » portent maintenant sur la journée en cours.
-- ----------------------------------------------------------------------------

drop function if exists etat_jeu_palet_match(uuid, uuid, uuid);

create or replace function etat_jeu_palet_match(
  p_benevole_id uuid,
  p_produit_id uuid
) returns table(nombre_vendu integer, lot_deja_offert boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from benevoles b
    where b.id = p_benevole_id and b.role = 'responsable' and b.actif = true
  ) then
    raise exception 'Action réservée aux responsables';
  end if;

  nombre_vendu := coalesce((
    select sum(vl.quantite)::integer
    from ventes_lignes vl
    join ventes v on v.id = vl.vente_id
    where v.created_at::date = current_date and vl.produit_id = p_produit_id
  ), 0);

  lot_deja_offert := exists (
    select 1 from lots_palet lp where lp.created_at::date = current_date
  );

  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- lister_lots_palet : le motif devient la colonne de référence pour
-- l'Historique ; le match reste affiché s'il existe (jointure devenue
-- facultative), mais n'est plus indispensable.
-- ----------------------------------------------------------------------------

drop function if exists lister_lots_palet(uuid);

create or replace function lister_lots_palet(
  p_benevole_id uuid
) returns table(
  lot_id uuid,
  cree_le timestamptz,
  benevole_nom text,
  motif text,
  date_match date,
  lieu text,
  adversaire text,
  nom_produit text,
  taille text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from benevoles b
    where b.id = p_benevole_id and b.role = 'responsable' and b.actif = true
  ) then
    raise exception 'Action réservée aux responsables';
  end if;

  return query
    select
      lp.id,
      lp.created_at,
      coalesce(lp.benevole_nom, b.nom, 'Bénévole supprimé'),
      lp.motif,
      m.date_match,
      m.lieu,
      m.adversaire,
      lpa.nom_produit,
      lpa.taille
    from lots_palet lp
    left join matchs m on m.id = lp.match_id
    left join benevoles b on b.id = lp.benevole_id
    join lots_palet_articles lpa on lpa.lot_id = lp.id
    order by lp.created_at desc, lpa.nom_produit;
end;
$$;

-- ----------------------------------------------------------------------------
-- Droits d'exécution (à réaccorder : un DROP FUNCTION perd ses grants).
-- ----------------------------------------------------------------------------

grant execute on function offrir_lot_palet(uuid, text, uuid, text, jsonb, boolean) to authenticated;
grant execute on function etat_jeu_palet_match(uuid, uuid) to authenticated;
grant execute on function lister_lots_palet(uuid) to authenticated;
