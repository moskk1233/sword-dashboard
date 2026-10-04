import React from 'react';
import {
  EuiCallOut,
  EuiCodeBlock,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLink,
  EuiSpacer,
  EuiSteps,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

const SURICATA_YAML = `# /etc/suricata/suricata.yaml
af-packet:
  - interface: enp0s3        # NIC that sees the protected traffic
    cluster-id: 99
    cluster-type: cluster_flow
    defrag: yes

outputs:
  - eve-log:
      enabled: yes
      filetype: regular
      filename: eve.json      # -> /var/log/suricata/eve.json
      types: [alert, flow, http, dns, tls]`;

const ML_LOG_LINE = `{"src_ip": "192.168.56.103", "dest_ip": "192.168.56.108", "dest_port": 80, "confidence": "0.932", "predicted_attack": "DoS"}`;

const OSSEC_AGENT = `<!-- /var/ossec/etc/ossec.conf (Wazuh Agent) -->
<localfile>
  <log_format>json</log_format>
  <location>/var/log/sword_detection/ml_log.json</location>
</localfile>

<localfile>
  <log_format>json</log_format>
  <location>/var/log/suricata/eve.json</location>
</localfile>`;

const MANAGER_RULE = `<!-- /var/ossec/etc/rules/local_rules.xml (Wazuh Manager) -->
<group name="ml_predictions">
  <rule id="100002" level="10">
    <decoded_as>json</decoded_as>
    <field name="predicted_attack">\\.+</field>
    <description>ML Prediction: $(predicted_attack)</description>
  </rule>
</group>`;

const VERIFY = `# On the agent: append a test detection
echo '${ML_LOG_LINE}' | sudo tee -a /var/log/sword_detection/ml_log.json

# On the manager: check the rule matches
sudo /var/ossec/bin/wazuh-logtest     # paste the JSON line, expect rule 100002`;

export const AgentSetupGuide = ({
  onClose,
  deployUrl,
}: {
  onClose: () => void;
  deployUrl: string;
}) => (
  <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="swordSetupTitle">
    <EuiFlyoutHeader hasBorder>
      <EuiTitle size="m">
        <h2 id="swordSetupTitle">Connect a Wazuh Agent to SWORD</h2>
      </EuiTitle>
      <EuiText size="s" color="subdued">
        Agent → Log Collector → Wazuh Manager (rule 100002) → Wazuh Indexer → SWORD Dashboard
      </EuiText>
    </EuiFlyoutHeader>
    <EuiFlyoutBody>
      <EuiSteps
        titleSize="xs"
        steps={[
          {
            title: 'Install and enroll the Wazuh Agent',
            children: (
              <EuiText size="s">
                <p>
                  Agent installation follows the standard Wazuh procedure. Use{' '}
                  <EuiLink href={deployUrl}>Deploy new agent</EuiLink> in Wazuh to generate the
                  install command, then confirm the agent shows as <strong>active</strong>.
                </p>
              </EuiText>
            ),
          },
          {
            title: 'Run Suricata on the agent',
            children: (
              <>
                <EuiText size="s">
                  <p>
                    Bind Suricata to the monitored interface with AF_PACKET and enable eve.json.
                  </p>
                </EuiText>
                <EuiSpacer size="s" />
                <EuiCodeBlock language="yaml" isCopyable fontSize="s" paddingSize="s">
                  {SURICATA_YAML}
                </EuiCodeBlock>
              </>
            ),
          },
          {
            title: 'Run the SWORD ML detector',
            children: (
              <>
                <EuiText size="s">
                  <p>
                    The detector reads eve.json in real time and, when the ensemble (Decision Tree,
                    Random Forest, XGBoost) is above its threshold, appends one JSON line per attack
                    to <code>/var/log/sword_detection/ml_log.json</code>. The field names must be:
                  </p>
                </EuiText>
                <EuiSpacer size="s" />
                <EuiCodeBlock language="json" isCopyable fontSize="s" paddingSize="s">
                  {ML_LOG_LINE}
                </EuiCodeBlock>
              </>
            ),
          },
          {
            title: 'Ship both logs with the Wazuh Log Collector',
            children: (
              <EuiCodeBlock language="xml" isCopyable fontSize="s" paddingSize="s">
                {OSSEC_AGENT}
              </EuiCodeBlock>
            ),
          },
          {
            title: 'Add the SWORD rule on the Wazuh Manager',
            children: (
              <>
                <EuiCodeBlock language="xml" isCopyable fontSize="s" paddingSize="s">
                  {MANAGER_RULE}
                </EuiCodeBlock>
                <EuiSpacer size="s" />
                <EuiText size="s">
                  <p>
                    Restart the manager (<code>systemctl restart wazuh-manager</code>) and the
                    agent.
                  </p>
                </EuiText>
              </>
            ),
          },
          {
            title: 'Verify',
            children: (
              <>
                <EuiCodeBlock language="bash" isCopyable fontSize="s" paddingSize="s">
                  {VERIFY}
                </EuiCodeBlock>
                <EuiSpacer size="s" />
                <EuiCallOut size="s" iconType="check" color="success" title="Done">
                  The detection appears on <strong>Attack Monitor</strong> within seconds, and the
                  server-side notifier forwards it to FCM if enabled.
                </EuiCallOut>
              </>
            ),
          },
        ]}
      />
    </EuiFlyoutBody>
  </EuiFlyout>
);
