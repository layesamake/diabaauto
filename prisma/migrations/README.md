# Migrations Diaba Auto

Migrations versionnées de la base PostgreSQL/Supabase, dans l'ordre imposé par
`docs/13_Plan_migrations_et_seeds.docx` (décisions T01/T02 de `docs/decisions.md`).

Outil unique : **Prisma Migrate**. La partie « structure » du SQL est **générée** — jamais écrite à la
main — par :

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

Le SQL que Prisma n'exprime pas (contraintes `CHECK`, index partiels, trigger `auth.users`, RLS,
policies, buckets Storage) est écrit à la main dans les mêmes migrations, sous un en-tête de section
« complément manuel ».

| Lot | Dossier | Contenu |
| --- | --- | --- |
| M01 | `20260928120000_m01_identite` | extension `pgcrypto`, 5 enums d'identité, `profiles`, `customer_profiles`, `staff_profiles`, `roles`, `permissions`, `staff_roles`, `role_permissions` |
| M02 | `20260928120100_m02_referentiels` | 8 enums (véhicule, éligibilité, média, prix, visibilité document, type de caractéristique), référentiels (`brands`, `vehicle_models`, `vehicle_generations`, `vehicle_trims`, `body_types`, `fuel_types`, `transmission_types`, `colors`, `option_categories`, `options`, `feature_definitions`), `vehicles` (jeu complet doc 03 §6), médias/documents (`vehicle_media`, `vehicle_documents`), associations (`vehicle_features`, `vehicle_options`), tables de prix (`vehicle_prices`, `exchange_rates`, `price_history`) |
| M03 | `20260928120200_m03_activite_client` | 3 enums d'activité, `favorite_vehicles`, `saved_searches`, `leads`, `custom_requests`, `orders` |
| M04 | `20260928120300_m04_journaux_audit_index` | `order_events`, `audit_logs`, `CHECK` sur les montants des tables canoniques (`vehicle_prices`, `orders`, `custom_requests`) (T04), index de clés étrangères et index partiel catalogue `WHERE is_published = true` (T06), audit append-only (T05) |
| M05 | `20260928120400_m05_rls_storage` | trigger `auth.users` + `handle_new_auth_user()` + `repair_orphan_profiles()` (T03), RLS (33 tables), 25 policies, `GRANT SELECT` colonne par colonne sur `vehicles` (colonnes internes exclues), 4 buckets Storage |
| M09 | `20261003000000_m09_bucket_images_prive` | bucket Storage `vehicle-images` passé en PRIVÉ ; images servies par la route `/api/media/[id]` (URL signée courte). Déployer le code avant d'appliquer la migration |
| M10 | `20261003120000_m10_limite_images_vehicule` | déclencheur SQL : au plus 5 images par véhicule (vidéos hors quota), insertions concurrentes sérialisées par verrou de ligne. Aucune donnée modifiée ; sans dépendance de déploiement avec le code |

Tous les noms suivent le contrat canonique (`docs/12_Schema_Prisma_final_propose.docx`) : colonnes `snake_case`,
rôles du personnel N:N via `staff_roles`, publication distincte du statut commercial (`vehicles.is_published`).

`migration_lock.toml` porte `provider = "postgresql"`.

## Contrôle hors ligne (aucune base requise)

```bash
node scripts/verify-migrations.mjs
```

Doit afficher `ÉCART = 0`. Toute évolution de `prisma/schema.prisma` impose de régénérer la partie
structure puis de relancer ce contrôle.

Procédure de livraison, plan de retour arrière (E23), garde-fou anti-production et limites connues :
`docs/exploitation-migrations.md`.
