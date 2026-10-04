# SWORD Dashboard (Wazuh Dashboard plugin)

**SWORD: Suricata-Wazuh for Offensive-attack Recognition & Detection**: the server-side (Wazuh Manager) part of the
project. It shows the attacks that the Machine Learning model on each Wazuh Agent detected, and forwards them to
Firebase Cloud Messaging (FCM).

> The Auto Self-Evolving dataset / model training part of the thesis is intentionally **not** part of this plugin.

## Pages

| Page | Who | What |
| --- | --- | --- |
| Attack Monitor | Admin, SOC | Daily attack trend (stacked by type), attacks by type, most popular attack per day, top attacker IPs, most targeted agents, top Suricata signatures, attack history (date/time, agent, type, confidence, IPs) with filters for date/time, agent, attack type and IP, auto-refresh, detail flyout |
| Agents | Admin, SOC | Every agent with ML detections / Suricata alerts, Wazuh status, last attack, "Connect an agent" guide. Adding and removing agents uses Wazuh's own agent management |
| Notifications | Admin | Web Notification / FCM (service account, FCM tokens, title/body, re-notify interval, minimum confidence, attack types, test), dashboard refresh / pop-ups, notifier status |
| Access Control | Admin | Role matrix, install the `sword_admin` / `sword_soc` OpenSearch roles, add or remove SOC members, force a password change |

## Access control

| | Master Administrator | SOC Team |
| --- | --- | --- |
| OpenSearch role | `all_access` (default `admin` user) or `sword_admin` | `sword_soc` |
| View dashboard, history, agents | ✓ | ✓ |
| Notification settings / access management | ✓ | ✗ |
| Must change password on first login | ✗ | ✓ |

Principles:

* **Deny by default.** A user with neither role cannot open SWORD: the nav link is hidden and every API returns 403.
* **Server-side enforcement.** Every route resolves the caller with `/_plugins/_security/authinfo`, using the caller's
  own credentials. Hiding things in the UI is cosmetic only.
* **Defense in depth.** Data queries run `asCurrentUser`, so indexer permissions also apply. `sword_soc` only has
  read access to `wazuh-alerts-*`, with document-level security limited to ML detections and Suricata alerts.
* **Least privilege for secrets.** The Firebase service account is encrypted with
  AES-256-GCM in a hidden saved object. It is never sent back to the browser (write-only field), and only admins
  can reach the settings API.
* **First-login password change.** A SOC member with no password-change record, or one that an admin flagged, gets
  `403 PASSWORD_CHANGE_REQUIRED` on every data route. The UI then shows a change-password screen, which calls the
  security plugin's self-service `PUT _plugins/_security/api/account` (it verifies the current password) and signs
  the user out.

User accounts are created with Wazuh's built-in user management (Indexer management → Security → Internal users).
After that, use **Access Control → Add to SOC team**.

## Notifications (server side)

A notifier on the dashboards server polls `wazuh-alerts-*` every 10 s for new `data.predicted_attack` documents from
all agents:

* FCM HTTP v1 to each registered FCM token. It authenticates with a service account through a JWT, so firebase-admin
  is not needed.
* Per-incident cooldown (agent + source IP + attack type), a minimum-confidence filter and an attack-type filter.
* The cursor is persisted, and old detections are never replayed when a channel is enabled.
* While SWORD is open, new detections also show as a toast, and as a desktop notification if you enable the bell.

Run the notifier on **one** dashboards node only (`swordMachineLearning.notifier.enabled: false` on the others).

## Configuration (`opensearch_dashboards.yml`, all optional)

```yaml
swordMachineLearning.access.adminRoles: ["all_access", "sword_admin"]
swordMachineLearning.access.socRoles: ["sword_soc"]
swordMachineLearning.access.enforcePasswordChange: true
swordMachineLearning.notifier.enabled: true
swordMachineLearning.notifier.intervalSeconds: 10
swordMachineLearning.notifier.timeZone: "Asia/Bangkok"
# Without this, a random key is generated in <path.data>/sword_secret.key (keep it; losing it means re-entering secrets)
swordMachineLearning.encryptionKey: "at-least-32-characters-long-secret........"
```

## Connecting a Wazuh Agent

The in-app guide is at Agents → **Connect an agent**. In short:

1. Agent: Suricata writes `/var/log/suricata/eve.json`. The SWORD detector appends JSON lines to
   `/var/log/sword_detection/ml_log.json`:
   `{"src_ip": "...", "dest_ip": "...", "dest_port": 80, "confidence": "0.932", "predicted_attack": "DoS"}`
2. Agent `ossec.conf`: add two `<localfile>` entries with `log_format` `json` (ml_log.json and eve.json).
3. Manager `local_rules.xml`: add rule `100002`, level 10, group `ml_predictions`, `decoded_as json`, with field
   `predicted_attack`.

## Development

```bash
# from the OpenSearch Dashboards root
yarn start                                     # plugin is picked up from plugins/sword-dashboard
cd plugins/sword-dashboard && yarn build --opensearch-dashboards-version 2.19.6   # -> build/*.zip
```

Without the security-dashboards plugin (plain dev mode) the browser asks for basic auth; sign in as `admin`.
