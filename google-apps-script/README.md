# Google Apps Script — Setup Guide

## Step 1: Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it **"RHA Attendance System"**
3. Rename the first tab to **"Students"**
4. Create a second tab called **"Attendance"**

### Students Sheet — Headers (Row 1):

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Student ID | Name | Age | Class | Guardian | Contact | Emergency Contact | Status |

### Sample Data (Rows 2+):

| Student ID | Name | Age | Class | Guardian | Contact | Emergency Contact | Status |
|---|---|---|---|---|---|---|---|
| RHA001 | Aarav Sharma | 8 | 3 | Priya Sharma | 9876543210 | 9876543211 | Active |
| RHA002 | Diya Patel | 9 | 4 | Ravi Patel | 9876543212 | 9876543213 | Active |
| RHA003 | Kabir Singh | 7 | 2 | Anita Singh | 9876543214 | 9876543215 | Active |

### Attendance Sheet — Headers (Row 1):

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Date | Time | Student ID | Name | Status | Device | Marked By |

*(Leave data rows empty — they will be filled by the app)*

### Users Sheet — Headers (Row 1):

| A | B | C | D | E |
|---|---|---|---|---|
| User ID | Name | Role | PIN Hash | Status |

*(Leave empty — the `setup()` function creates it and seeds a default admin)*

**Roles:**
- `admin` — can manage students (add/edit/import) and manage users
- `staff` — can scan attendance and view dashboards/reports only

---

## Step 2: Get the Spreadsheet ID

The Spreadsheet ID is in the URL of your Google Sheet:

```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

Copy the part between `/d/` and `/edit`.

---

## Step 3: Add the Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any existing code in `Code.gs`
3. Copy the entire contents of `Code.gs` from this folder
4. **Replace** `YOUR_SPREADSHEET_ID_HERE` with your actual Spreadsheet ID
5. Save the project (Ctrl+S / Cmd+S)
6. **Run `setup()` once**: in the Apps Script editor, select the `setup`
   function in the toolbar and click **Run**. This creates the Students,
   Attendance, and Users sheets (with headers) and seeds a default admin
   account: **User ID `U001`, PIN `1234`** — change it after first login.

> Every API request now requires `userId` + `pin` (except `login`).
> PINs are stored as SHA-256 hashes — never plaintext.

---

## Step 4: Deploy as Web App

1. Click **Deploy → New Deployment**
2. Click the gear icon next to "Select type" and choose **Web app**
3. Settings:
   - **Description**: "RHA Attendance API v1"
   - **Execute as**: **Me** (your Google account)
   - **Who has access**: **Anyone**
4. Click **Deploy**
5. You'll be asked to authorize — click through the Google permissions
6. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## Step 5: Configure Frontend

1. Open the `.env` file in the project root
2. Set the API URL:
   ```
   VITE_API_URL=https://script.google.com/macros/s/AKfycb.../exec
   ```
3. Restart the dev server (`npm run dev`)

---

## Step 6: Test

Test login first (replace URL with your deployment):

```
https://script.google.com/macros/s/AKfycb.../exec?action=login&userId=U001&pin=1234
```

You should see `"success": true` with the admin user. Then test an
authenticated endpoint by appending `&userId=U001&pin=1234`:

```
https://script.google.com/macros/s/AKfycb.../exec?action=getStudents&userId=U001&pin=1234
```

---

## Updating the Backend

After making changes to `Code.gs`:

1. Go to **Deploy → Manage Deployments**
2. Click the pencil (edit) icon
3. Under "Version", select **New version**
4. Click **Deploy**

> **Important**: You MUST create a new version for changes to take effect. The URL stays the same.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| CORS error | Make sure you're using `text/plain` content type (the frontend handles this) |
| 405 Method Not Allowed | Only GET and POST are supported by Apps Script |
| "Authorization Required" | Re-authorize the script (Deploy → Manage → re-deploy) |
| Stale data | Clear the cache by redeploying with a new version |
| Slow response | First request after idle may take 3-5s (cold start). Subsequent requests are faster. |
