# Songsmith

A cut-up / found-language songwriting workspace. Pull public-domain phrases (and your own
texts) into a left-hand source column, write in a centre scratchpad, and reshape words with
inline rhyme/synonym/definition tools plus an ambient "words that often follow" strip.

Runs as an installable PWA on Android tablet, phone and Windows desktop. Drafts sync across
devices via a small PHP + MySQL backend.

## Stack
- **Frontend:** buildless HTML/CSS/JS PWA (no Node build step). Served as static files.
- **Backend:** PHP 8.3 REST API (`/api/*.php`), PDO + MySQL.
- **Hosting:** cPanel at hassaallen.net, subdomain `songs.hassaallen.net`.
- **External data (proxied server-side):** Datamuse, PoetryDB, Free Dictionary API, Gutendex.

## Layout of this repo
```
public/              <-- everything web-served (this is the deploy target)
  index.html
  manifest.webmanifest
  sw.js
  css/app.css
  js/api.js
  js/app.js
  icons/             <-- PWA icons (added before launch)
  api/               <-- PHP backend (must live under web root to be served)
    config.php       <-- real DB credentials (gitignored; copy from config.sample.php)
    config.sample.php
    db.php
    helpers.php
    login.php
    logout.php
    me.php
    drafts.php
    texts.php
    proxy.php
    schema.sql
.cpanel.yml          <-- cPanel Git deployment (copies public/* to the document root)
```

## First-time setup
1. Create the MySQL database + user in cPanel.
2. Import `public/api/schema.sql` via phpMyAdmin.
3. Copy `config.sample.php` to `config.php` and fill in DB credentials.
4. Create the first user (see "Creating users" below).
5. Push to the cPanel Git repo and Deploy.

## Creating users
There is no public sign-up. Accounts are created manually. Generate a password hash and
insert a row — see `public/api/make_user.php` usage notes (run once, then delete) or insert
directly via phpMyAdmin using PHP's `password_hash()`.
