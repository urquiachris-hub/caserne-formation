# 🚒 Caserne — Suivi formation

Application de suivi des qualifications (secourisme, incendie, spécialités), du planning de formation et des FMPA.

- **Front** : React + Vite, hébergé sur GitHub Pages (déploiement automatique à chaque push sur `main`)
- **Back** : Supabase (base PostgreSQL + authentification + sécurité par ligne)

## Fonctionnalités V1 (administrateurs)

| Module | Contenu |
|---|---|
| Tableau de bord | Agents actifs, qualifications expirées / à recycler sous 60 j, prochaines sessions |
| Personnel | Liste, recherche, ajout, import/export CSV, fiche agent |
| Fiche agent | Qualifications (obtention, recyclage, échéance, état), heures de formation de l'année vs attendues, historique |
| Matrice compétences | Tableau agents × référentiels coloré par état, nb d'agents opérationnels par qualif, export |
| Planning & FMPA | Sessions par mois, inscriptions, présences, heures validées, feuille d'émargement, validation automatique des recyclages |
| Référentiels | Catalogue modifiable (validité en mois, heures de FC annuelles, prérequis) |

**V2 prévue** : espace agent (chaque agent voit son propre suivi). La base est déjà prête (colonne `personnel.user_id` + règles de sécurité « agent »).

## Mise en route (une seule fois)

### 1. Créer le projet Supabase
1. Sur https://supabase.com, se connecter avec le Gmail de la caserne → **New project**.
2. Région : **West EU (Paris)** ou **Central EU (Frankfurt)** (données personnelles → rester dans l'UE).
3. Noter le mot de passe de la base dans un endroit sûr.

### 2. Créer la base
Dans Supabase → **SQL Editor** → New query :
1. coller et exécuter `supabase/schema.sql` ;
2. coller et exécuter `supabase/seed.sql`.

### 3. Créer le premier administrateur
1. Supabase → **Authentication → Users → Add user** (email + mot de passe, cocher *Auto confirm*).
2. Dans le SQL Editor :
   ```sql
   insert into profils (user_id, role)
   select id, 'admin' from auth.users where email = 'email.caserne@gmail.com';
   ```
3. Recommandé : **Authentication → Sign In / Providers → Email** : désactiver *Allow new users to sign up* (seuls les admins créent les comptes).

### 4. Activer le déploiement automatique (une seule fois)
Le fichier de déploiement n'a pas pu être créé automatiquement (droit « workflow » non accordé au connecteur). À faire à la main :
1. Ouvrir `setup/deploy.yml` dans ce dépôt → bouton **Copy raw file**.
2. **Add file → Create new file** → nom : `.github/workflows/deploy.yml` → coller → **Commit changes**.

### 5. Relier GitHub à Supabase
1. Supabase → **Project Settings → API** : copier *Project URL* et la clé *anon public*.
2. GitHub → dépôt → **Settings → Secrets and variables → Actions → New repository secret** :
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = clé anon public
3. GitHub → **Settings → Pages** → Source : **GitHub Actions**.
4. Onglet **Actions** → *Déploiement GitHub Pages* → **Run workflow**.

L'application est alors en ligne sur `https://<compte>.github.io/<depot>/`.

> La clé *anon* est publique par nature ; la protection des données repose sur les règles RLS de `schema.sql`. Ne jamais mettre la clé *service_role* dans le code ou dans GitHub.

### 6. Ajouter un administrateur supplémentaire
Créer l'utilisateur (étape 3.1) puis exécuter la requête `insert into profils…` avec son email.

## Import CSV du personnel
Fichier séparé par `;` avec en-tête (colonnes facultatives sauf nom/prénom) :
```
nom;prenom;grade;statut;matricule;email;telephone;date_entree
DUPONT;Jean;CPL;SPV;12345;jean.dupont@mail.fr;0600000000;2018-09-01
```
`statut` ∈ SPV, SPP, PATS, JSP — `date_entree` au format AAAA-MM-JJ.

## Développement local
```bash
cp .env.example .env   # renseigner URL + clé anon
npm install
npm run dev
```

## Règles de calcul
- **Échéance** = (dernier recyclage, sinon date d'obtention) + validité du référentiel.
- **État** : *Expiré* si échéance dépassée, *À recycler* si < 60 jours, *Suspendu* si coché manuellement.
- **Heures de formation** : somme des sessions où l'agent est *Présent* (heures validées si saisies, sinon durée de la session).
- Les périodicités et heures fournies dans `seed.sql` sont **indicatives** : à aligner sur le règlement de formation du SDIS.
