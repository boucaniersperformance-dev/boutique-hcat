-- =====================================================================
-- Boutique HCAT — schéma Supabase complet
-- =====================================================================
-- À coller intégralement dans Supabase > SQL Editor > New query, puis
-- "Run". Ce script est autonome : il crée les tables, la sécurité (RLS),
-- les fonctions et les 25 produits de départ. Il peut être relancé sans
-- risque sur un projet Supabase tout neuf.
--
-- Modèle de sécurité (à lire si un jour une écriture semble "bloquée
-- silencieusement") :
--   - Les tables `produits` et `variantes_produit` sont lisibles par
--     toute session connectée à l'appli (connexion anonyme Supabase).
--   - Les tables `benevoles`, `ventes` et `ventes_lignes` ne sont PAS
--     accessibles directement : RLS est activé dessus SANS aucune
--     policy, donc tout accès direct est refusé. Le seul moyen d'y lire
--     ou d'y écrire est d'appeler une fonction RPC (ci-dessous), qui elle
--     s'exécute avec des droits élevés (SECURITY DEFINER) et vérifie
--     elle-même qui a le droit de faire quoi (ex : rôle "responsable").
--   - Si un écran de l'appli semble ne rien afficher ou une action ne
--     rien faire, la cause la plus probable est soit (a) ce script SQL
--     n'a pas été exécuté sur le bon projet Supabase, soit (b) le nom
--     d'une fonction RPC appelée côté application ne correspond plus
--     exactement à une fonction définie ici.
-- =====================================================================

-- Sur Supabase, les extensions comme pgcrypto s'installent dans un schéma
-- "extensions" séparé de "public". On le crée au cas où, puis on l'ajoute
-- explicitement au search_path de cette session pour que les appels à
-- crypt()/gen_salt() plus bas (y compris hors des fonctions) fonctionnent
-- quel que soit le réglage par défaut du projet.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists benevoles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  pin_hash text not null,
  role text not null default 'benevole' check (role in ('benevole', 'responsable')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists produits (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prix numeric(10,2) not null default 0,
  necessite_taille boolean not null default false,
  jeu_tailles text check (jeu_tailles in ('adulte', 'enfant')),
  photo_url text,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coherence_tailles check (
    (necessite_taille and jeu_tailles is not null)
    or (not necessite_taille and jeu_tailles is null)
  )
);

create table if not exists variantes_produit (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references produits(id) on delete cascade,
  taille text, -- null pour un produit sans déclinaison de taille
  stock_qty integer -- null = stock non suivi/pas encore renseigné
);

-- Une seule ligne de stock par (produit, taille), et une seule ligne
-- "sans taille" par produit.
create unique index if not exists variantes_avec_taille_uidx
  on variantes_produit (produit_id, taille) where taille is not null;
create unique index if not exists variantes_sans_taille_uidx
  on variantes_produit (produit_id) where taille is null;

create table if not exists ventes (
  id uuid primary key default gen_random_uuid(),
  benevole_id uuid references benevoles(id) on delete set null,
  benevole_nom text, -- copie du nom au moment de la vente (survit à la suppression du bénévole)
  mode_paiement text not null check (mode_paiement in ('cb', 'especes')),
  total numeric(10,2) not null,
  montant_recu numeric(10,2),
  monnaie_rendue numeric(10,2),
  created_at timestamptz not null default now()
);

-- Migration pour un projet où la table `ventes` existait déjà avant cet
-- ajout : on rend benevole_id supprimable sans casser l'historique, on
-- ajoute la colonne de copie du nom, et on la remplit rétroactivement.
alter table ventes add column if not exists benevole_nom text;
alter table ventes alter column benevole_id drop not null;
alter table ventes drop constraint if exists ventes_benevole_id_fkey;
alter table ventes add constraint ventes_benevole_id_fkey
  foreign key (benevole_id) references benevoles(id) on delete set null;
update ventes v set benevole_nom = b.nom
  from benevoles b where b.id = v.benevole_id and v.benevole_nom is null;

create table if not exists ventes_lignes (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references ventes(id) on delete cascade,
  produit_id uuid not null references produits(id),
  nom_produit text not null, -- copie du nom au moment de la vente
  taille text,
  quantite integer not null check (quantite > 0),
  prix_unitaire numeric(10,2) not null
);

create index if not exists ventes_created_at_idx on ventes (created_at);
create index if not exists ventes_lignes_vente_id_idx on ventes_lignes (vente_id);
create index if not exists variantes_produit_id_idx on variantes_produit (produit_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table benevoles enable row level security;
alter table produits enable row level security;
alter table variantes_produit enable row level security;
alter table ventes enable row level security;
alter table ventes_lignes enable row level security;

-- Catalogue et stock : lecture ouverte à toute session ayant ouvert
-- l'appli (connexion anonyme Supabase = rôle "authenticated").
drop policy if exists "lecture produits" on produits;
create policy "lecture produits" on produits
  for select using (auth.role() = 'authenticated');

drop policy if exists "lecture variantes" on variantes_produit;
create policy "lecture variantes" on variantes_produit
  for select using (auth.role() = 'authenticated');

-- Supabase accorde normalement déjà ces droits par défaut à tout nouveau
-- projet, mais on les rend explicites ici pour que ce script soit
-- autonome et ne dépende d'aucun réglage implicite du projet.
grant usage on schema public to anon, authenticated;
grant select on produits to authenticated;
grant select on variantes_produit to authenticated;

-- benevoles / ventes / ventes_lignes : aucune policy = aucun accès
-- direct depuis le client, dans aucun sens. Tout passe par les
-- fonctions RPC plus bas. On ne leur accorde volontairement aucun droit
-- SELECT/INSERT/UPDATE/DELETE direct.

-- ---------------------------------------------------------------------
-- Fonctions
-- ---------------------------------------------------------------------

-- Liste des bénévoles actifs pour l'écran de connexion (juste id + nom,
-- jamais le pin_hash ni le rôle).
create or replace function lister_benevoles_actifs()
returns table(id uuid, nom text)
language sql
security definer
set search_path = public, extensions
as $$
  select id, nom from benevoles where actif = true order by nom;
$$;

-- Vérifie le code PIN d'un bénévole sélectionné sur l'écran de connexion.
create or replace function verifier_pin(p_benevole_id uuid, p_pin text)
returns table(ok boolean, nom text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_benevole benevoles%rowtype;
begin
  select * into v_benevole from benevoles where id = p_benevole_id and actif = true;
  if not found then
    return query select false, null::text, null::text;
    return;
  end if;

  if v_benevole.pin_hash = crypt(p_pin, v_benevole.pin_hash) then
    return query select true, v_benevole.nom, v_benevole.role;
  else
    return query select false, null::text, null::text;
  end if;
end;
$$;

-- Enregistre une vente complète de façon atomique : calcule le total à
-- partir des prix en base (jamais depuis le client), insère la vente et
-- ses lignes, décrémente le stock. Si le paiement est en espèces, exige
-- un montant reçu suffisant et renvoie la monnaie à rendre.
create or replace function enregistrer_vente(
  p_benevole_id uuid,
  p_mode_paiement text,
  p_montant_recu numeric,
  p_lignes jsonb
) returns table(vente_id uuid, total numeric, monnaie numeric)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_benevole benevoles%rowtype;
  v_total numeric(10,2);
  v_monnaie numeric(10,2);
  v_vente_id uuid;
  v_produit produits%rowtype;
  v_variante variantes_produit%rowtype;
  r record;
begin
  select * into v_benevole from benevoles where id = p_benevole_id and actif = true;
  if not found then
    raise exception 'Bénévole introuvable ou inactif';
  end if;

  if p_mode_paiement not in ('cb', 'especes') then
    raise exception 'Mode de paiement invalide';
  end if;

  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le panier est vide';
  end if;

  select coalesce(sum(pr.prix * l.quantite), 0)
  into v_total
  from jsonb_to_recordset(p_lignes) as l(produit_id uuid, taille text, quantite int)
  join produits pr on pr.id = l.produit_id;

  if p_mode_paiement = 'especes' then
    if p_montant_recu is null or p_montant_recu < v_total then
      raise exception 'Montant reçu insuffisant';
    end if;
    v_monnaie := round(p_montant_recu - v_total, 2);
  else
    v_monnaie := null;
  end if;

  insert into ventes (benevole_id, benevole_nom, mode_paiement, total, montant_recu, monnaie_rendue)
  values (p_benevole_id, v_benevole.nom, p_mode_paiement, v_total, p_montant_recu, v_monnaie)
  returning id into v_vente_id;

  for r in
    select l.produit_id, l.taille, l.quantite
    from jsonb_to_recordset(p_lignes) as l(produit_id uuid, taille text, quantite int)
  loop
    select * into v_produit from produits where id = r.produit_id;
    if not found then
      raise exception 'Produit introuvable : %', r.produit_id;
    end if;

    insert into ventes_lignes (vente_id, produit_id, nom_produit, taille, quantite, prix_unitaire)
    values (v_vente_id, v_produit.id, v_produit.nom, r.taille, r.quantite, v_produit.prix);

    select * into v_variante
    from variantes_produit
    where produit_id = r.produit_id and taille is not distinct from r.taille;

    if found then
      update variantes_produit
      set stock_qty = coalesce(stock_qty, 0) - r.quantite
      where id = v_variante.id;
    end if;
  end loop;

  return query select v_vente_id, v_total, v_monnaie;
end;
$$;

-- Met à jour prix / statut actif / photo d'un produit (responsable uniquement).
create or replace function modifier_produit(
  p_benevole_id uuid,
  p_produit_id uuid,
  p_prix numeric,
  p_actif boolean,
  p_photo_url text
) returns void
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

  update produits
  set prix = coalesce(p_prix, prix),
      actif = coalesce(p_actif, actif),
      photo_url = coalesce(p_photo_url, photo_url)
  where id = p_produit_id;
end;
$$;

-- Met à jour le stock d'une déclinaison de produit (responsable uniquement).
create or replace function modifier_stock(
  p_benevole_id uuid,
  p_variante_id uuid,
  p_stock_qty integer
) returns void
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

  update variantes_produit
  set stock_qty = greatest(0, p_stock_qty)
  where id = p_variante_id;
end;
$$;

-- Liste complète des bénévoles, y compris inactifs (responsable uniquement).
create or replace function lister_benevoles(p_benevole_id uuid)
returns table(id uuid, nom text, role text, actif boolean, created_at timestamptz)
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
    select b.id, b.nom, b.role, b.actif, b.created_at
    from benevoles b
    order by b.nom;
end;
$$;

-- Ajoute un bénévole (responsable uniquement).
create or replace function ajouter_benevole(
  p_benevole_id uuid,
  p_nom text,
  p_pin text,
  p_role text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from benevoles b
    where b.id = p_benevole_id and b.role = 'responsable' and b.actif = true
  ) then
    raise exception 'Action réservée aux responsables';
  end if;

  if p_role not in ('benevole', 'responsable') then
    raise exception 'Rôle invalide';
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'Le code doit contenir exactement 4 chiffres';
  end if;

  insert into benevoles (nom, pin_hash, role)
  values (trim(p_nom), crypt(p_pin, gen_salt('bf')), p_role)
  returning id into v_id;

  return v_id;
end;
$$;

-- Active / désactive un bénévole (responsable uniquement).
create or replace function changer_statut_benevole(
  p_benevole_id uuid,
  p_cible_id uuid,
  p_actif boolean
) returns void
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

  update benevoles set actif = p_actif where id = p_cible_id;
end;
$$;

-- Change le PIN d'un bénévole (responsable uniquement).
create or replace function changer_pin_benevole(
  p_benevole_id uuid,
  p_cible_id uuid,
  p_nouveau_pin text
) returns void
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

  if p_nouveau_pin !~ '^[0-9]{4}$' then
    raise exception 'Le code doit contenir exactement 4 chiffres';
  end if;

  update benevoles
  set pin_hash = crypt(p_nouveau_pin, gen_salt('bf'))
  where id = p_cible_id;
end;
$$;

-- Change le rôle d'un bénévole existant (responsable uniquement). Empêche
-- de se retrouver sans aucun responsable actif.
create or replace function changer_role_benevole(
  p_benevole_id uuid,
  p_cible_id uuid,
  p_role text
) returns void
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

  if p_role not in ('benevole', 'responsable') then
    raise exception 'Rôle invalide';
  end if;

  if p_role = 'benevole' and (
    select count(*) from benevoles
    where role = 'responsable' and actif = true and id <> p_cible_id
  ) = 0 then
    raise exception 'Impossible : il doit rester au moins un responsable actif';
  end if;

  update benevoles set role = p_role where id = p_cible_id;
end;
$$;

-- Supprime définitivement un bénévole (responsable uniquement). Son
-- historique de ventes est conservé (le nom y est déjà recopié), seule la
-- fiche bénévole disparaît. Empêche de se supprimer soi-même et de
-- supprimer le dernier responsable actif.
create or replace function supprimer_benevole(
  p_benevole_id uuid,
  p_cible_id uuid
) returns void
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

  if p_cible_id = p_benevole_id then
    raise exception 'Tu ne peux pas supprimer ton propre compte';
  end if;

  if (select role from benevoles where id = p_cible_id) = 'responsable'
    and (
      select count(*) from benevoles
      where role = 'responsable' and actif = true and id <> p_cible_id
    ) = 0
  then
    raise exception 'Impossible : il doit rester au moins un responsable actif';
  end if;

  delete from benevoles where id = p_cible_id;
end;
$$;

-- Supprime une vente (ex : vente de test), en exigeant le code PIN d'un
-- responsable en confirmation — même si l'appli n'affiche ce bouton qu'aux
-- responsables déjà connectés, cette double vérification évite une
-- suppression accidentelle d'un simple clic. Le stock des articles vendus
-- est restitué avant suppression.
create or replace function supprimer_vente(
  p_benevole_id uuid,
  p_pin text,
  p_vente_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_benevole benevoles%rowtype;
  r record;
begin
  select * into v_benevole from benevoles b
  where b.id = p_benevole_id and b.role = 'responsable' and b.actif = true;
  if not found then
    raise exception 'Action réservée aux responsables';
  end if;

  if v_benevole.pin_hash <> crypt(p_pin, v_benevole.pin_hash) then
    raise exception 'Code PIN incorrect';
  end if;

  if not exists (select 1 from ventes where id = p_vente_id) then
    raise exception 'Vente introuvable';
  end if;

  for r in
    select produit_id, taille, quantite from ventes_lignes where vente_id = p_vente_id
  loop
    update variantes_produit
    set stock_qty = stock_qty + r.quantite
    where produit_id = r.produit_id and taille is not distinct from r.taille;
  end loop;

  delete from ventes where id = p_vente_id;
end;
$$;

-- Historique des ventes sur une période (responsable uniquement).
create or replace function lister_ventes(
  p_benevole_id uuid,
  p_date_debut date,
  p_date_fin date
) returns table(
  vente_id uuid,
  cree_le timestamptz,
  benevole_nom text,
  mode_paiement text,
  total numeric,
  montant_recu numeric,
  monnaie_rendue numeric,
  detail text
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
      v.id,
      v.created_at,
      coalesce(v.benevole_nom, b.nom, 'Bénévole supprimé'),
      v.mode_paiement,
      v.total,
      v.montant_recu,
      v.monnaie_rendue,
      string_agg(
        vl.nom_produit || coalesce(' (' || vl.taille || ')', '') || ' x' || vl.quantite,
        E'\n' order by vl.nom_produit
      )
    from ventes v
    left join benevoles b on b.id = v.benevole_id
    join ventes_lignes vl on vl.vente_id = v.id
    where v.created_at::date >= p_date_debut
      and v.created_at::date <= p_date_fin
    group by v.id, v.created_at, v.benevole_nom, b.nom, v.mode_paiement, v.total, v.montant_recu, v.monnaie_rendue
    order by v.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution des fonctions
-- ---------------------------------------------------------------------
-- Toutes les fonctions ci-dessus contrôlent elles-mêmes qui a le droit de
-- faire quoi (via le rôle du bénévole passé en paramètre). On les rend
-- exécutables par toute session connectée à l'appli.

grant execute on function lister_benevoles_actifs() to authenticated, anon;
grant execute on function verifier_pin(uuid, text) to authenticated, anon;
grant execute on function enregistrer_vente(uuid, text, numeric, jsonb) to authenticated;
grant execute on function modifier_produit(uuid, uuid, numeric, boolean, text) to authenticated;
grant execute on function modifier_stock(uuid, uuid, integer) to authenticated;
grant execute on function lister_benevoles(uuid) to authenticated;
grant execute on function ajouter_benevole(uuid, text, text, text) to authenticated;
grant execute on function changer_statut_benevole(uuid, uuid, boolean) to authenticated;
grant execute on function changer_pin_benevole(uuid, uuid, text) to authenticated;
grant execute on function changer_role_benevole(uuid, uuid, text) to authenticated;
grant execute on function supprimer_benevole(uuid, uuid) to authenticated;
grant execute on function supprimer_vente(uuid, text, uuid) to authenticated;
grant execute on function lister_ventes(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Stockage des photos produits
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('produits-photos', 'produits-photos', true)
on conflict (id) do nothing;

drop policy if exists "lecture publique photos produits" on storage.objects;
create policy "lecture publique photos produits"
  on storage.objects for select
  using (bucket_id = 'produits-photos');

drop policy if exists "envoi photos produits" on storage.objects;
create policy "envoi photos produits"
  on storage.objects for insert
  with check (bucket_id = 'produits-photos' and auth.role() = 'authenticated');

drop policy if exists "maj photos produits" on storage.objects;
create policy "maj photos produits"
  on storage.objects for update
  using (bucket_id = 'produits-photos' and auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- Premier bénévole responsable
-- ---------------------------------------------------------------------
-- Sans ce compte, personne ne peut se connecter à l'appli au tout début.
-- ⚠️ Change ce PIN (1234) dès ta première connexion, depuis l'écran
-- "Bénévoles" une fois identifié.

insert into benevoles (nom, pin_hash, role)
values ('Responsable', crypt('1234', gen_salt('bf')), 'responsable')
on conflict (nom) do nothing;

-- ---------------------------------------------------------------------
-- Catalogue de départ (25 produits)
-- ---------------------------------------------------------------------
-- 3 produits n'ont pas encore de prix validé dans le fichier fourni
-- (Legging femme, Short de sport, Sac de sport) : ils sont créés à 0,00 €
-- et affichés avec un badge "Prix à définir" dans l'appli tant qu'un
-- responsable ne les corrige pas depuis l'écran "Produits".
-- Ce bloc ne s'exécute que si la table est vide, pour pouvoir relancer
-- le script sans dupliquer le catalogue.

do $$
declare
  v_id uuid;
begin
  if (select count(*) from produits) > 0 then
    raise notice 'Catalogue déjà présent : insertion des produits ignorée.';
    return;
  end if;

  -- 1. T-shirt impression numérique adulte 190g
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('T-shirt impression numérique adulte 190g', 18.00, true, 'adulte', 1)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 2. T-shirt impression numérique enfant 150g
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('T-shirt impression numérique enfant 150g', 15.00, true, 'enfant', 2)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['5-6 ans', '7-9 ans', '10-12 ans', '14-15 ans']) as t;

  -- 3. Polo impression numérique homme
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Polo impression numérique homme', 20.00, true, 'adulte', 3)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 4. Polo impression numérique femme
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Polo impression numérique femme', 20.00, true, 'adulte', 4)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 5. Sweat cœur sans capuche adulte
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Sweat cœur sans capuche adulte', 40.00, true, 'adulte', 5)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 6. Hoodie cœur capuche adulte
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Hoodie cœur capuche adulte', 40.00, true, 'adulte', 6)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 7. Hoodie cœur capuche enfant
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Hoodie cœur capuche enfant', 35.00, true, 'enfant', 7)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['5-6 ans', '7-9 ans', '10-12 ans', '14-15 ans']) as t;

  -- 8. Sweat cœur sans capuche enfant
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Sweat cœur sans capuche enfant', 35.00, true, 'enfant', 8)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['5-6 ans', '7-9 ans', '10-12 ans', '14-15 ans']) as t;

  -- 9. Legging femme (prix à définir)
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Legging femme', 0.00, true, 'adulte', 9)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 10. Short de sport (prix à définir)
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Short de sport', 0.00, true, 'adulte', 10)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 11. Teddy
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Teddy', 60.00, true, 'adulte', 11)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 12. Softshell
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Softshell', 60.00, true, 'adulte', 12)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty)
    select v_id, t, null from unnest(array['S', 'M', 'L', 'XL', 'XXL']) as t;

  -- 13. Mug classique
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Mug classique', 10.00, false, null, 13)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 14. Serviette en coton brodée
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Serviette en coton brodée', 16.00, false, null, 14)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 15. Serviette microfibre
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Serviette microfibre', 10.00, false, null, 15)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 16. Chope de bière
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Chope de bière', 9.00, false, null, 16)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 17. Gourde de sport
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Gourde de sport', 10.00, false, null, 17)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 18. Claquette de bain
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Claquette de bain', 19.00, false, null, 18)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 19. Casquette trucker
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Casquette trucker', 18.00, false, null, 19)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 20. Casquette ultimate
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Casquette ultimate', 18.00, false, null, 20)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 21. Bonnet
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Bonnet', 18.00, false, null, 21)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 22. Parapluie
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Parapluie', 20.00, false, null, 22)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 23. Ours peluche maillot
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Ours peluche maillot', 24.00, false, null, 23)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 24. Sac de sport (prix à définir)
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Sac de sport', 0.00, false, null, 24)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

  -- 25. Écharpe laine
  insert into produits (nom, prix, necessite_taille, jeu_tailles, ordre)
  values ('Écharpe laine', 17.00, false, null, 25)
  returning id into v_id;
  insert into variantes_produit (produit_id, taille, stock_qty) values (v_id, null, null);

end $$;
