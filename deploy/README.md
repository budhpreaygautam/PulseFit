# Putting PulseFit live (free)

| Part | Service | Why |
|---|---|---|
| Server | Oracle Cloud **Always Free** VM, India region (Mumbai or Hyderabad) | Always on, a real disk for the JSON database, close to Gurugram |
| HTTPS + access | **Cloudflare Tunnel** (free) | Automatic HTTPS and DDoS protection; the server opens no web ports (the app listens on 127.0.0.1 only) |
| Domain | **DigitalPlat FreeDomain** `*.dpdns.org` (free) | A real delegated domain on the Public Suffix List, which Cloudflare accepts. Moving to a paid `.in` later means changing `PUBLIC_URL` only |

Everything here costs nothing. Each free service can change its terms, which is why the database is backed up daily on the server and can be copied to your PC (`pull-backup.ps1`).

## 1. Accounts (only you can do these)

1. **Domain**: at <https://dash.domain.digitalplat.org> register e.g. `pulsefitgym.dpdns.org`.
2. **Cloudflare**: create a free account at <https://dash.cloudflare.com>, *Add a domain* → your `*.dpdns.org` name → Free plan. Cloudflare shows two nameservers: enter them for the domain in the DigitalPlat dashboard. Wait until Cloudflare says the domain is **Active** (minutes to a few hours).
   Then under *SSL/TLS → Edge Certificates* turn on **Always Use HTTPS** and set **Minimum TLS Version** to 1.2.
3. **Oracle Cloud**: sign up at <https://www.oracle.com/cloud/free/>; choose **India South (Hyderabad)** or **India West (Mumbai)** as the home region (it cannot be changed later). Oracle asks for a card to verify you; Always Free resources are not charged.
   Create a compute instance:
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **VM.Standard.A1.Flex** with 1 OCPU / 6 GB (Always Free). If it says "out of capacity", use **VM.Standard.E2.1.Micro** instead.
   - SSH keys: *Paste public key*: the contents of `%USERPROFILE%\.ssh\pulsefit_server.pub`
   - Note the instance's **public IP address**.

   Oracle may reclaim an Always Free instance that stays almost idle for 7 days. To rule that out, upgrade the account to *Pay As You Go* (Always Free resources stay free) and set a budget alert of ₹100 under *Billing → Budgets*.

## 2. Install and deploy (from this PC)

```powershell
cd "C:\Users\budhp\Vs Projects\gym-webapp"
.\deploy\deploy.ps1 -Server <public-ip> -Setup -PublicUrl https://pulsefitgym.dpdns.org
```

This builds the app, prepares the server (Node.js 22, cloudflared, a hardened `pulsefit` service, automatic security updates, daily backups, a root-only settings file with a fresh random `JWT_SECRET`), installs the release and checks that it answers. Later updates are just:

```powershell
.\deploy\deploy.ps1 -Server <public-ip>
```

A release that fails to start is rolled back automatically; the last 3 releases stay on the server.

## 3. Connect the domain (Cloudflare Tunnel)

In Cloudflare: *Zero Trust* (Cloudflare One) → *Networks → Tunnels* → **Create a tunnel** → *Cloudflared* → name it `pulsefit`. Pick *Debian* and your server's architecture (A1 = arm64, E2 = amd64) and copy the `sudo cloudflared service install …` command. Run it on the server:

```powershell
ssh -i $env:USERPROFILE\.ssh\pulsefit_server ubuntu@<public-ip>
# then paste the command Cloudflare showed you
```

Back in Cloudflare, add a **Public hostname**: domain `pulsefitgym.dpdns.org` (no subdomain), service **HTTP** `localhost:5004`. Save. The site is now live at `https://pulsefitgym.dpdns.org`.

The token in that command is a secret: paste it only into the server.

## 4. First admin account

Still on the server; it prints a temporary password once (change it after signing in):

```bash
sudo pulsefit-create-admin you@example.com "Your Name"
```

## Day to day

| Task | Command |
|---|---|
| Deploy an update | `.\deploy\deploy.ps1 -Server <ip>` |
| Copy the newest backup to this PC | `.\deploy\pull-backup.ps1 -Server <ip>` |
| Server log | `ssh -i $env:USERPROFILE\.ssh\pulsefit_server ubuntu@<ip> "journalctl -u pulsefit -n 100 --no-pager"` |
| Restart | `ssh … "sudo systemctl restart pulsefit"` |
| Change settings (Razorpay, YouPI, Google sign-in) | `ssh …`, `sudo nano /etc/pulsefit/pulsefit.env`, `sudo systemctl restart pulsefit` |
| Restore a backup | `sudo systemctl stop pulsefit`, `sudo sh -c 'gunzip -c /var/lib/pulsefit/backups/<file> > /var/lib/pulsefit/gym-db.json'`, `sudo chown pulsefit:pulsefit /var/lib/pulsefit/gym-db.json`, `sudo systemctl start pulsefit` |

Daily backup to this PC (Windows Task Scheduler, runs at 9:00):

```powershell
schtasks /Create /SC DAILY /ST 09:00 /TN "PulseFit backup" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\Users\budhp\Vs Projects\gym-webapp\deploy\pull-backup.ps1\" -Server <ip>"
```

## After going live

- Google Search Console: add the domain property (DNS verification record in Cloudflare) and submit `https://<domain>/sitemap.xml`.
- "Continue with Google": add `https://<domain>` as an authorised JavaScript origin of your OAuth client, then set `GOOGLE_CLIENT_ID`.
- The Android app: build the release APK against the live site (next section) before sharing it.

## Android app (release APK)

From `client/` on this PC, with `JAVA_HOME` (JDK 21) and `ANDROID_HOME` set (see the main README):

```powershell
npm run mobile:release                                  # against https://pulsefit.up.railway.app
npm run mobile:release -- --api https://<domain>        # another https server
```

It builds the app against that API (https only), runs `assembleRelease`, checks the signature with `apksigner` and prints the version, size and SHA-256 of `client\android\app\build\outputs\apk\release\app-release.apk`. Publish that file as `downloads/pulsefit.apk` in the folder that holds the database (on Railway `/data/downloads/pulsefit.apk` on the `pulsefit-volume`); the website then offers it at `/downloads/pulsefit.apk` without a redeploy. Afterwards run `npm run mobile:sync` (or `start-pulsefit-app.bat`) to point the app on your emulator or phone back at this PC.

To upload to Railway from the repo folder (the volume commands go over SSH, so register a key first with `railway ssh keys add`; `--overwrite` replaces the current APK; in Git Bash prefix the commands with `MSYS_NO_PATHCONV=1` so `/downloads/...` is not rewritten to a Windows path):

```powershell
railway volume files --volume pulsefit-volume upload client\android\app\build\outputs\apk\release\app-release.apk /downloads/pulsefit.apk --overwrite
railway volume files --volume pulsefit-volume list /downloads
```

An optional `/downloads/pulsefit.json` beside it, `{ "versionName": "1.0.0", "versionCode": 1, "sha256": "<sha256>" }`, puts the version in `GET /api/config`.

**New version**: in `client/android/app/build.gradle`, raise `versionCode` by 1 and set `versionName` (e.g. `1.0.1`) before building. Android will not install an update whose `versionCode` is not higher than the installed one.

**Back up the release key.** The first `mobile:release` creates it, with a random password, in:

- `%USERPROFILE%\.pulsefit\pulsefit-release.jks` (the keystore, outside the repo)
- `client\android\keystore.properties` (its location and password; git-ignored)

Copy both to somewhere safe and offline (a password manager or an encrypted USB drive). Every update must be signed with this same key: if either file is lost, phones that installed the app cannot update it and people have to uninstall it (losing its data) and install the new APK. Never commit them or paste the password into chats or tickets. To restore on a new PC, put both files back at those paths (keep `storeFile` in `keystore.properties` pointing at the keystore).
