# SOUL Advisors — Profile System
## Setup & Deployment Guide

---

## How It Works

One codebase. One deployment. Every team member gets their own URL like:

```
arief.soul-advisors.sg
sarah.soul-advisors.sg
hafiz.soul-advisors.sg
admin.soul-advisors.sg   ← your master dashboard
```

The app reads the subdomain and loads the right profile automatically.

---

## Step 1 — Deploy to Netlify (5 minutes)

1. Create a free account at https://netlify.com
2. Drag the entire `soul-advisors` folder into Netlify's deploy area  
   (or connect your GitHub repo if you prefer)
3. Netlify will publish your site at a URL like `happy-fox-123.netlify.app`

---

## Step 2 — Connect Your Domain & Subdomains

In **Netlify → Site Settings → Domain Management**:

1. Add your custom domain: `soul-advisors.sg`
2. Add a wildcard subdomain: `*.soul-advisors.sg`
3. In your domain registrar (GoDaddy / Namecheap / SingTel etc), add:
   - `A` record: `*.soul-advisors.sg` → Netlify's IP (they'll give you this)
   - Or a `CNAME`: `*.soul-advisors.sg` → `your-netlify-site.netlify.app`

Once DNS propagates (usually 15–30 min), every subdomain will work automatically.

---

## Step 3 — Configure Your Team

Edit `public/data.json` to add your team members:

```json
{
  "members": [
    {
      "id": "sarah",
      "subdomain": "sarah",
      "name": "Sarah Lim Wei Ting",
      "title": "Senior Financial Consultant",
      "agentCode": "BZ2-XXXXX",
      "phone": "+6598765432",
      "whatsapp": "6598765432",
      "email": "sarah@soul-advisors.sg",
      "photo": "",
      "bio": "Her bio here...",
      "credentials": ["MDRT", "CFP"],
      "specialisations": ["Health Planning", "Young Families"],
      "accent": "#5A7FB8",
      "yearsExperience": "8",
      "testimonials": [],
      "isAdmin": false,
      "passwordHash": "PASSWORD_HASH_HERE"
    }
  ]
}
```

### Generating a password hash

Each member's password is stored as a SHA-256 hash (never plain text). To generate one:

1. Go to: https://emn178.github.io/online-tools/sha256.html
2. Type the password → copy the hash
3. Paste it into `passwordHash` in data.json

**Default passwords in the starter file:**
- `arief` subdomain → password: `password`
- `sarah` subdomain → password: `1`
- `hafiz` subdomain → password: `2`

**Change these immediately after deployment.**

---

## Step 4 — Team Members Self-Service

Share this with each team member:

> **Your profile URL:** `yourname.soul-advisors.sg`  
> **Your password:** *(give them their initial password)*  
>
> To edit your profile:
> 1. Visit your profile URL
> 2. Scroll to the bottom — click **Sign In** (or look for the floating bar)
> 3. Enter your password
> 4. Click **Edit Profile**
> 5. Update your photo, bio, credentials, testimonials, and colour accent
> 6. Click **Save** — changes appear instantly

Profile edits are saved locally in the browser and persist across sessions. For full server-side persistence (recommended for a team), upgrade to the database version — ask your developer to connect Supabase or Airtable as the data backend.

---

## Step 5 — Admin Dashboard

Visit `admin.soul-advisors.sg` and sign in with the admin password (default: `password` — change immediately in data.json).

From the dashboard you can:
- See all team member profiles at a glance
- Add new members (name, subdomain, initial password, accent colour)
- Edit any member's basic info
- Remove members
- View their live profile

---

## File Structure

```
soul-advisors/
├── public/
│   ├── index.html      ← entire app (profile + editor + admin)
│   └── data.json       ← all team member data
├── netlify.toml        ← routing config (do not edit)
└── README.md           ← this file
```

---

## Accent Colours — Suggestions per FC

| Name | Suggested Colour | Hex |
|------|-----------------|-----|
| Arief | Warm gold | `#B8975A` |
| Sarah | Calm blue | `#5A7FB8` |
| Hafiz | Forest green | `#5AB87A` |
| Add your own | — | any hex |

---

## Upgrading Later

When your team grows, you can upgrade to:
- **Supabase** (free) — proper database, real-time updates, image uploads
- **Cloudflare Pages** — better wildcard subdomain support  
- **Custom CMS** — Contentful or Sanity for full content management

The architecture is designed to slot a backend in without rebuilding the frontend.

---

## Support

Built by Claude for SOUL Advisors / Strategic Partners (BZ2-28803), Prudential Singapore.
