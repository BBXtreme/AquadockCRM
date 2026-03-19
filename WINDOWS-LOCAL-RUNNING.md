# AquaDock CRM – Windows Guide

**How to run the stable main branch locally**

You now have two branches:

- **main** → Stable production-ready version (v5)
- **vercel-debug** → Branch for fixing Vercel build issues

This guide shows you exactly how to run the **stable main branch** on Windows.

------

## Prerequisites (Step-by-Step Setup for Windows)

Before you start, make sure the following three things are set up correctly.

### 1. Git is installed

Git is required to download and switch between branches.

**Installation Steps:**

1. Open your browser and go to: https://git-scm.com/download/win
2. Click the big **Windows** button to download the installer
3. Run the downloaded file (Git-*.exe)
4. Follow the installer:
   - Accept the license agreement
   - Choose the default installation folder
   - Select **"Git from the command line and also from 3rd-party tools"**
   - Keep all other options on default
5. Click **Install**
6. **Restart your computer** (highly recommended)

**Verify Git is working:**

1. Press Windows key + S

2. Type **PowerShell** and open it

3. Type this command and press Enter:

   PowerShell

   ```
   git --version
   ```

   You should see a version like

    

   git version 2.45.0.windows.1

------

### 2. Node.js 20 or higher is installed

Node.js runs the AquaDock CRM application.

**Installation Steps:**

1. Go to the official website: [https://nodejs.org](https://nodejs.org/)
2. Download the **LTS** version (currently recommended) or any version **20 or higher**
3. Run the downloaded .msi installer
4. Click **Next** on every screen (default settings are fine)
5. Click **Install**
6. **Restart your computer** after installation

**Verify Node.js is installed:** Open PowerShell and run these two commands:

PowerShell

```
node -v
npm -v
```

You should see:

- v20.xx.x or higher for Node.js
- A version number for npm (e.g. 10.x.x)

------

### 3. You have cloned the repository

This means the project code is downloaded to your computer.

**Method A – Using GitHub Desktop (Easiest for beginners):**

1. Download GitHub Desktop from: [https://desktop.github.com](https://desktop.github.com/)
2. Install it and sign in with your GitHub account
3. Click **"Clone a repository from the internet"**
4. Search for aquadock-crm-v5
5. Choose a folder on your computer and click **Clone**

**Method B – Using Command Line (PowerShell):**

1. Open PowerShell

2. Go to your projects folder (example):

   PowerShell

   ```
   cd C:\Users\YourName\Documents\GitHub
   ```

3. Clone the repository:

   PowerShell

   ```
   git clone https://github.com/YOUR-USERNAME/aquadock-crm-v5.git
   ```

4. Enter the project folder:

   PowerShell

   ```
   cd aquadock-crm-v5
   ```

------

## Method 1: Quick Branch Switching (Recommended)

1. Open PowerShell in your project folder

2. Switch to the stable version:

   PowerShell

   ```
   git checkout main
   ```

3. Install dependencies and start:

   PowerShell

   ```
   npm install
   npm run dev
   ```

→ App opens at **[http://localhost:3000](http://localhost:3000/)**

**To switch back to debugging:**

PowerShell

```
git checkout vercel-debug
npm install
npm run dev
```

------

## Method 2: Separate Folder (Cleanest for Windows)

1. Create a new folder called aquadock-crm-v5-main

2. Open PowerShell and run:

   PowerShell

   ```
   git clone https://github.com/YOUR-USERNAME/aquadock-crm-v5.git aquadock-crm-v5-main
   cd aquadock-crm-v5-main
   git checkout main
   npm install
   npm run dev
   ```

Now you have a completely separate stable version.

------

## Bonus: One-Click Start Scripts (.bat files)

Create these two files for super easy launching:

**START-MAIN.bat** (in your main folder):

bat

```
@echo off
title 🌊 AquaDock CRM - STABLE MAIN
color 0A
echo.
echo ================================================
echo   AquaDock CRM - STABLE MAIN BRANCH
echo ================================================
echo.
npm run dev
pause
```

**START-DEBUG.bat** (in your debug folder):

bat

```
@echo off
title 🛠 AquaDock CRM - DEBUG BRANCH
color 0B
echo.
echo ================================================
echo   AquaDock CRM - VERCEL DEBUG BRANCH
echo ================================================
echo.
npm run dev
pause
```

Double-click either file to start the version you want.

------

You are now fully set up on Windows! Whenever you want to continue fixing Vercel, just run:

PowerShell

```
git checkout vercel-debug
```



## Quick Reference Table

| Action                   | Command / Action                                |
| ------------------------ | ----------------------------------------------- |
| Switch to stable version | git checkout main                               |
| Switch to debug version  | git checkout vercel-debug                       |
| Start stable version     | Double-click START-MAIN.bat                     |
| Start debug version      | Double-click START-DEBUG.bat                    |
| Update stable version    | git pull origin main in main folder             |
| Open browser             | [http://localhost:3000](http://localhost:3000/) |

------

**You are now fully set up!**

- Stable production version = main branch (or separate folder)
- Development / Vercel fixes = vercel-debug branch
- One-click .bat files for Windows convenience