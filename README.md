# Hospital Information: Pharmacy and Medical Inventory Management System

Subsystem for the Hospital Information System. Online-capable (works on laptop, phone, tablet browsers),
Node.js + Express + MongoDB Atlas. Login page: blue hero design (MedRecords-style) with Forgot password / account recovery.

Proponents: Jefferson C. Vargas, Adam Brian O. Lacbanes, John Riven D. Requiez, Arian B. Abaigar

## PART A - Run it on your laptop (Visual Studio Code)

1. Install Node.js LTS from https://nodejs.org (tick the default options). Restart VS Code afterwards.
2. Unzip this folder, then in VS Code: File > Open Folder > choose `hospital-pharmacy-inventory`.
3. Open the terminal: Terminal > New Terminal.
4. Install the packages (needs internet, only once):
       npm install
5. MongoDB Atlas (your database) - one-time setup in https://cloud.mongodb.com :
   - Left menu > Security > Network Access > Add IP Address > "Allow access from anywhere" (0.0.0.0/0) > Confirm.
     (Required so your laptop AND the online website can reach the database.)
   - Left menu > Database Access: confirm user `adambrianlacbanes401_db_user` exists with the password used in `.env`.
6. The file `.env` already contains your Atlas URL. Change JWT_SECRET to any long random text.
7. Start the system:
       npm start
   You should see:  `Connected to MongoDB Atlas`  and  `running on port 3000`.
8. Open http://localhost:3000
   First login:  username `admin`   password `Admin@123`   (change it: "Change password" at bottom-left).
9. The database starts EMPTY (no sample data). Suggested order:
   Categories > Suppliers > Medicines / Medical Supplies > Stock In > Stock Out > Reports.

Open it on your phone while on the same Wi-Fi: find your laptop IP (`ipconfig` > IPv4, e.g. 192.168.1.5)
and visit http://192.168.1.5:3000 (allow Node.js through Windows Firewall if asked).

## PART B - Put it ONLINE (access anywhere, free) using GitHub + Render

1. Create a free account at https://github.com, then a new PRIVATE repository (e.g. `pharmacy-inventory`).
2. In the VS Code terminal:
       git init
       git add .
       git commit -m "Pharmacy and Medical Inventory"
       git branch -M main
       git remote add origin https://github.com/YOUR-USERNAME/pharmacy-inventory.git
       git push -u origin main
   (`.gitignore` keeps `.env` out of GitHub - your database password is NOT uploaded.)
3. Create a free account at https://render.com > New + > Web Service > connect your GitHub repo.
   - Runtime: Node      Build Command: `npm install`      Start Command: `npm start`
   - Instance type: Free
4. Environment Variables (copy the values from your local `.env` file; type them on the Render page, never upload `.env`):
       MONGODB_URI   = mongodb+srv://adambrianlacbanes401_db_user:YOURPASSWORD@cluster0.hd93qzs.mongodb.net/
       DB_NAME       = hospital_pharmacy_inventory
       JWT_SECRET    = (any long random text)
       NODE_VERSION  = 20
       ADMIN_USERNAME= admin
       ADMIN_PASSWORD= (choose a strong password)
5. Click Deploy. After a few minutes Render gives you a link like https://pharmacy-inventory.onrender.com -
   open it from any laptop or phone. Free plan sleeps after ~15 min idle; first open then takes ~30 seconds.

## Forgot password (account recovery)
- On registration, users pick a security question and answer (answer is stored hashed, not case-sensitive).
- Login page > "Forgot password?" > enter username > answer the question > set a new password.
- Accounts created earlier (or by the admin) have no question yet: the user logs in and sets one via
  "Recovery question" (bottom-left). If a password is already forgotten, the Administrator resets it in Users > Edit.
- Recovery is rate-limited (10 tries / 15 minutes).

## Roles
- Administrator: everything, including Users (approve registrations, add/disable users) and deleting records.
- Pharmacist: manage medicines, supplies, suppliers, categories; stock in/out; stock adjustments; reports.
- Inventory Staff: view; stock in / stock out; reports.
Self-registered accounts can log in immediately (no approval). The admin can still disable an account under Users.

## Proposal features covered
Medicine records, Medical supplies, Supplier records, Stock in/out (rejects unavailable stock),
Batch & expiry tracking (near-expiry / expired flags), Stock monitoring with reorder levels and
authorized adjustments with reason, Printable reports (stock, low-stock, expiry, movement), Role-based access,
permanent transaction history.

## Troubleshooting
- "Could not connect to MongoDB Atlas": Network Access must allow 0.0.0.0/0; check the password in `.env`
  (special characters in a password must be URL-encoded).
- "npm is not recognized": install Node.js, then close and reopen VS Code.
- Port in use: change PORT in `.env` (e.g. 3001).

## Online checklist
- Atlas > Network Access allows 0.0.0.0/0 (Render's address changes, so a fixed IP will not work).
- `.env` is NOT in GitHub (the .gitignore blocks it).
- After deploy, open `https://YOUR-APP.onrender.com/health` - it should show `{"ok":true,"db":true}`.
- The admin account already exists in the database, so ADMIN_PASSWORD on Render is only used if the database is empty.
- To update the live site later: `git add .` > `git commit -m "update"` > `git push` (Render redeploys automatically).
