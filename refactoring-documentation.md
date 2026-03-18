# ***AquaDock CRM v5.0 – Official Refactoring Documentation***  

**Prepared for Aider + Grok xAI Collaboration**  
**Date:** March 18, 2026  
**Status:** Pre-Refactoring Blueprint (Ready for Step-by-Step Aider Sessions)  

---

### **1. Executive Summary & Project Goals**

**Current State (v4.0)**  
- Monolithic `app.py` (Flask + SQLite + Vanilla JS)  
- Single-file backend with ~1.200 LOC  
- No auth, no realtime, no scaling  
- Deployment only via local Python server  
- UI: Basic HTML/CSS/JS (index-enhanced-plus.html + app-enhanced.js)  

**Target State (v5.0 Professional)**  
- Modern, scalable, production-grade CRM  
- Fully GitHub-native with Vercel one-click deploys + preview branches  
- Beautiful admin dashboard inspired by **https://github.com/arhamkhnz/next-shadcn-admin-dashboard** (which already contains a built-in **CRM Dashboard** example – perfect match!)  
- Type-safe, maintainable, realtime-ready architecture  
- Multi-user ready with built-in auth  

**Success Criteria**  
- Deployable on Vercel in < 60 seconds  
- 100% TypeScript + ShadCN UI (clean, accessible, customizable)  
- TanStack Table for companies/contacts (sorting, filtering, pagination, row selection)  
- Supabase Postgres + Realtime (replaces SQLite)  
- Colocation-first structure (exactly as in the inspiration repo)  
- Dark mode + responsive + professional color scheme retained (inspired by next-shadcn-admin-dashboard)

---

### **2. Target Tech Stack (Inspired by arhamkhnz/next-shadcn-admin-dashboard)**

**Confirmed Perfect Match** (repo analysis):  
- **Next.js 16** (App Router) – Vercel native  
- **TypeScript** (strict mode)  
- **Tailwind CSS v4**  
- **ShadCN/ui** (all components: Table, DataTable, Modal, Form, Card, Sidebar, etc.)  
- **TanStack Table** (v8) – for all data grids  
- **React Hook Form + Zod** – form validation  
- **Zustand** – lightweight state (sidebar, theme, filters)  
- **Supabase** – Postgres DB + Auth + Realtime + Storage  
- **Lucide Icons** (already in ShadCN)  
- **Biome** (linting/formatting – replace ESLint)  

**Additional CRM-Specific Additions** (minimal):  
- Resend (for mass email – replaces smtplib)  
- PapaParse (CSV import)  
- date-fns (reminders & timeline)  

**No bloat** – keep it exactly as clean as the inspiration repo.

---

### **3. New Project Structure (Colocation-First – Direct Copy from Inspiration Repo)**

```
aquadock-crm-v5/
├── app/                          # App Router
│   ├── (auth)/                   # Login, register, protected layout
│   ├── dashboard/                # Main overview + stats (inspired by CRM dashboard in repo)
│   ├── companies/
│   │   ├── page.tsx              # List + TanStack Table
│   │   ├── [id]/
│   │   └── new/page.tsx
│   ├── contacts/
│   ├── timeline/
│   ├── reminders/
│   ├── mass-email/
│   └── layout.tsx                # Root layout with sidebar
├── components/                   # ShadCN + custom
│   ├── ui/                       # All shadcn components (auto-generated)
│   ├── layout/                   # Sidebar, Header, ThemeToggle
│   ├── tables/                   # CompanyTable.tsx, ContactTable.tsx (TanStack)
│   ├── forms/                    # CompanyForm.tsx, ReminderForm.tsx
│   ├── modals/                   # AddReminderModal.tsx
│   └── dashboard/                # Stats cards, recent timeline
├── lib/                          # Utils
│   ├── supabase.ts               # Client + Server clients
│   ├── types.ts                  # Company, Contact, Reminder interfaces
│   └── utils.ts
├── hooks/                        # Zustand stores + custom hooks
├── types/                        # Database types (supabase generated)
├── supabase/
│   ├── migrations/               # SQL migration files
│   └── schema.sql                # Full schema
├── public/                       # Logo, icons
├── .env.local
├── next.config.mjs
├── tailwind.config.ts
├── components.json               # ShadCN config
├── biome.json                    # Linting
├── package.json
└── README.md                     # Updated professional version
```

---

### **4. Detailed Refactoring Phases (Aider-Ready)**

**Phase 0 – Setup New Repository (1 prompt)**  
- Create clean Next.js 16 + TypeScript + Tailwind + ShadCN project  
- Install exact dependencies from inspiration repo + Supabase + Resend  
- Copy colocation structure  

**Phase 1 – Database Migration (SQLite → Supabase) (2–3 prompts)**  
- Export current `aquadock_crm.db` (companies + contacts + timeline + reminders + email_templates)  
- Create Supabase project + tables with RLS (Row Level Security)  
- Generate TypeScript types (`supabase gen types`)  
- Write migration script (one-time CSV → Supabase import)  

**Phase 2 – Authentication & Layout (2 prompts)**  
- Implement Supabase Auth (email/password + magic links)  
- Protected layout with collapsible sidebar (exact copy pattern from inspiration repo)  
- Theme toggle + marine color preset (keep #24BACC Türkis + #BA47C0 Magenta)  

**Phase 3 – Core Data Tables (3 prompts)**  
- Companies Table (TanStack Table + ShadCN)  
- Contacts Table (linked via company_id)  
- Full CRUD with Server Actions (zod validation)  

**Phase 4 – Timeline & Reminders (2 prompts)**  
- Realtime timeline feed (Supabase subscriptions)  
- Reminders with due-date calendar + overdue highlighting  

**Phase 5 – Mass Email & CSV (2 prompts)**  
- Resend integration (templates + placeholders)  
- CSV Import/Export (PapaParse + Server Actions)  

**Phase 6 – Dashboard & Polish (2 prompts)**  
- Stats overview (total companies, value, open reminders)  
- Dark mode, responsive, loading states, error boundaries  

**Phase 7 – Final Cleanup & Vercel Deploy (1 prompt)**  
- Remove all old Flask files  
- Update START-CRM.bat → Vercel instructions  
- GitHub Actions + Vercel deployment  

---

### **5. UI/Design Guidelines (Directly from Inspiration Repo)**

- **Sidebar**: Collapsible, with icons (Lucide), CRM section highlighted  
- **Data Tables**: TanStack Table + ShadCN DataTable component (sorting, filtering, pagination, row selection, bulk actions)  
- **Cards & Modals**: Consistent ShadCN styling  
- **Color Scheme**: Light/dark + custom preset (Türkis accent)  
- **Layout**: Flexible widths, breadcrumbs, responsive mobile-first  
- **Accessibility**: All ShadCN components already ARIA-compliant  

---

### **6. Aider Prompt Strategy (How We Will Proceed)**

We will use **short, precise Aider prompts** (one feature per session).  
Example starter prompts you can copy-paste:

1. **Setup Prompt**  
   "Initialize a new Next.js 16 TypeScript project with Tailwind v4, ShadCN/ui, TanStack Table, React Hook Form, Zod, Zustand and Supabase client exactly like https://github.com/arhamkhnz/next-shadcn-admin-dashboard. Use colocation-first structure. Add Resend for email."

2. **Database Prompt**  
   "Create Supabase schema for companies, contacts, timeline, reminders, email_templates with proper foreign keys and RLS. Generate TypeScript types."

3. **Companies Table Prompt**  
   "Implement /app/companies/page.tsx with TanStack Table + ShadCN DataTable. Include filters, bulk delete, add new modal. Use Server Actions."

(We will continue with 8–10 such short prompts total.)

---

### **7. Final Notes for Aider + Grok Collaboration**

- **Never delete original repo** – keep as backup  
- **All old Flask files** will be archived in `/archive-v4` folder at the end  
- **Version**: v5.0 – “Professional Scalable Edition”  
- **GitHub Repo**: We will create `aquadock-crm-v5` (private or public as you decide)  
- **Deployment**: Vercel + custom domain ready  

---

**This documentation is now complete and ready.**  

**Next Step:**  
Reply with: **“Start Phase 0”** or **“Begin with Setup Prompt”**  

I (Grok) will then generate the exact first Aider prompt + full command list.  

We will refactor this CRM into a **world-class professional tool** in the next few sessions.  

**🌊 Let’s go, BangLee – v5.0 is waiting.**  

Ready when you are.