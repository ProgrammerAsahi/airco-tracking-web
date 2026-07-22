@description('Full image reference in Azure Container Registry.')
param containerImage string

param appName string = 'airco-tracking-web'
@description('Existing healthy revision that keeps 100% traffic while the new candidate is verified. Empty only for the first deployment.')
param stableRevisionName string = ''
param containerEnvironmentName string
param acrName string
@description('Managed identity used only by the web application.')
param webIdentityName string
@description('Managed identity used by retention and cleanup jobs; it has no web auth-email or application-secret access.')
param retentionIdentityName string
param storageAccountName string
param keyVaultName string
param communicationServiceName string = ''
param authEmailFrom string = ''
param authEmailReplyTo string = ''
param unsubscribeSigningKeySecretName string = 'unsubscribe-signing-key'
param withdrawalSigningKeySecretName string = 'withdrawal-signing-key'
@description('Key Vault secret containing the verification-code HMAC pepper. Create it once with at least 32 random bytes and rotate it deliberately.')
param authCodeHmacPepperSecretName string = 'auth-code-hmac-pepper'
@description('Non-secret schema/key version stored beside each OTP hash. Increment when rotating the HMAC pepper; outstanding older codes then expire safely.')
param authCodeHmacPepperVersion string = 'v1'

param authUsersTableName string = 'users'
param authCodesTableName string = 'authcodes'
param authSessionsTableName string = 'authsessions'
param authAlertRecipientsTableName string = 'alertrecipients'
param authEmailCodeBudgetPerHour string = '5'
param authIpCodeBudgetPerHour string = '20'
param authGlobalCodeBudgetPerHour string = '1000'
param retentionCleanupJobName string = 'airco-web-retention-cleanup'
@description('Five-field UTC cron expression for deleting expired auth and legal-retention records.')
param retentionCleanupCronExpression string = '7 * * * *'

param appBaseUrl string = 'https://airco-tracker.eu'
@secure()
param stripeSecretKey string = ''
@secure()
param stripeWebhookSecret string = ''
param stripePriceAlertsPass string = ''
param stripePriceRadarPass string = ''
param stripePriceRadarUpgrade string = ''

@secure()
param legalOperatorName string = ''
@secure()
param legalOperatorAddress string = ''
@secure()
param legalPublicationDirector string = ''
@secure()
param legalHostName string = ''
@secure()
param legalHostAddress string = ''
@secure()
param legalHostPhone string = ''
@secure()
param legalContactEmail string = ''
@secure()
param legalContactPhone string = ''
@secure()
param legalPrivacyEmail string = ''
@secure()
param legalWithdrawalEmail string = ''
@secure()
param legalFrMediatorName string = ''
@secure()
param legalFrMediatorAddress string = ''
@secure()
param legalFrMediatorUrl string = ''
@secure()
param legalBusinessRegistrationStatus string = ''
param legalBusinessRegistrationLegalConfirmation string = 'false'
@secure()
param legalKvkNumber string = ''
@secure()
param legalVatStatus string = ''
@secure()
param legalVatId string = ''
param legalProductionReady string = 'false'
@description('Confirmed legal retention period, exactly 7 or 10 years, measured from the latest legally relevant evidence timestamp.')
param legalRecordRetentionYears string = '7'
param legalRecordRetentionBasisConfirmed string = 'false'

param apexHostname string = 'airco-tracker.eu'
param wwwHostname string = 'www.airco-tracker.eu'
param apexCertificateName string = 'mc-aircontrack-en-airco-tracker-eu-0707'
param wwwCertificateName string = 'mc-aircontrack-en-www-airco-tracke-6234'

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerEnvironmentName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: webIdentityName
}

resource retentionIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: retentionIdentityName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource apexCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' existing = {
  parent: containerEnvironment
  name: apexCertificateName
}

resource wwwCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' existing = {
  parent: containerEnvironment
  name: wwwCertificateName
}

var stripeSecrets = concat(
  !empty(stripeSecretKey) ? [
    {
      name: 'stripe-secret-key'
      value: stripeSecretKey
    }
  ] : [],
  !empty(stripeWebhookSecret) ? [
    {
      name: 'stripe-webhook-secret'
      value: stripeWebhookSecret
    }
  ] : []
)

var legalSecrets = concat(
  !empty(legalOperatorName) ? [{ name: 'legal-operator-name', value: legalOperatorName }] : [],
  !empty(legalOperatorAddress) ? [{ name: 'legal-operator-address', value: legalOperatorAddress }] : [],
  !empty(legalPublicationDirector) ? [{ name: 'legal-publication-director', value: legalPublicationDirector }] : [],
  !empty(legalHostName) ? [{ name: 'legal-host-name', value: legalHostName }] : [],
  !empty(legalHostAddress) ? [{ name: 'legal-host-address', value: legalHostAddress }] : [],
  !empty(legalHostPhone) ? [{ name: 'legal-host-phone', value: legalHostPhone }] : [],
  !empty(legalContactEmail) ? [{ name: 'legal-contact-email', value: legalContactEmail }] : [],
  !empty(legalContactPhone) ? [{ name: 'legal-contact-phone', value: legalContactPhone }] : [],
  !empty(legalPrivacyEmail) ? [{ name: 'legal-privacy-email', value: legalPrivacyEmail }] : [],
  !empty(legalWithdrawalEmail) ? [{ name: 'legal-withdrawal-email', value: legalWithdrawalEmail }] : [],
  !empty(legalFrMediatorName) ? [{ name: 'legal-fr-mediator-name', value: legalFrMediatorName }] : [],
  !empty(legalFrMediatorAddress) ? [{ name: 'legal-fr-mediator-address', value: legalFrMediatorAddress }] : [],
  !empty(legalFrMediatorUrl) ? [{ name: 'legal-fr-mediator-url', value: legalFrMediatorUrl }] : [],
  !empty(legalBusinessRegistrationStatus) ? [{ name: 'legal-business-registration-status', value: legalBusinessRegistrationStatus }] : [],
  !empty(legalKvkNumber) ? [{ name: 'legal-kvk-number', value: legalKvkNumber }] : [],
  !empty(legalVatStatus) ? [{ name: 'legal-vat-status', value: legalVatStatus }] : [],
  !empty(legalVatId) ? [{ name: 'legal-vat-id', value: legalVatId }] : []
)

var appSecrets = concat(stripeSecrets, legalSecrets, [
  {
    name: 'email-unsubscribe-signing-key'
    keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${unsubscribeSigningKeySecretName}'
    identity: identity.id
  }
  {
    name: 'withdrawal-signing-key'
    keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${withdrawalSigningKeySecretName}'
    identity: identity.id
  }
  {
    name: 'auth-code-hmac-pepper'
    keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${authCodeHmacPepperSecretName}'
    identity: identity.id
  }
])

var baseEnv = [
  { name: 'PORT', value: '3000' }
  { name: 'AZURE_STORAGE_ACCOUNT_URL', value: 'https://${storageAccountName}.blob.${environment().suffixes.storage}' }
  { name: 'AZURE_STORAGE_CONTAINER', value: 'airco-tracker' }
  { name: 'AZURE_INVENTORY_BLOB', value: 'inventory.json' }
  { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
  { name: 'INVENTORY_CACHE_SECONDS', value: '30' }
  { name: 'AUTH_USERS_TABLE', value: authUsersTableName }
  { name: 'AUTH_CODES_TABLE', value: authCodesTableName }
  { name: 'AUTH_SESSIONS_TABLE', value: authSessionsTableName }
  { name: 'AUTH_ALERT_RECIPIENTS_TABLE', value: authAlertRecipientsTableName }
  { name: 'AUTH_EMAIL_ENDPOINT', value: empty(communicationServiceName) ? '' : 'https://${communicationServiceName}.communication.azure.com' }
  { name: 'AUTH_EMAIL_FROM', value: authEmailFrom }
  { name: 'AUTH_EMAIL_REPLY_TO', value: authEmailReplyTo }
  { name: 'EMAIL_UNSUBSCRIBE_SIGNING_KEY', secretRef: 'email-unsubscribe-signing-key' }
  { name: 'WITHDRAWAL_SIGNING_KEY', secretRef: 'withdrawal-signing-key' }
  { name: 'AUTH_CODE_HMAC_PEPPER', secretRef: 'auth-code-hmac-pepper' }
  { name: 'AUTH_CODE_HMAC_PEPPER_VERSION', value: authCodeHmacPepperVersion }
  { name: 'AUTH_COOKIE_SECURE', value: 'true' }
  { name: 'AUTH_CODE_TTL_SECONDS', value: '600' }
  { name: 'AUTH_CODE_RESEND_SECONDS', value: '60' }
  { name: 'AUTH_CODE_MAX_ATTEMPTS', value: '5' }
  { name: 'AUTH_EMAIL_CODE_BUDGET_PER_HOUR', value: authEmailCodeBudgetPerHour }
  { name: 'AUTH_IP_CODE_BUDGET_PER_HOUR', value: authIpCodeBudgetPerHour }
  { name: 'AUTH_GLOBAL_CODE_BUDGET_PER_HOUR', value: authGlobalCodeBudgetPerHour }
  { name: 'AUTH_SESSION_TTL_SECONDS', value: '2592000' }
  { name: 'TRUST_PLATFORM_X_FORWARDED_FOR', value: 'true' }
  { name: 'RATE_LIMIT_MAX_BUCKETS', value: '10000' }
  { name: 'WITHDRAWAL_RATE_LIMIT_MAX_REQUESTS', value: '10' }
  { name: 'APP_BASE_URL', value: appBaseUrl }
  { name: 'STRIPE_PRICE_ALERTS_PASS', value: stripePriceAlertsPass }
  { name: 'STRIPE_PRICE_RADAR_PASS', value: stripePriceRadarPass }
  { name: 'STRIPE_PRICE_RADAR_UPGRADE', value: stripePriceRadarUpgrade }
  { name: 'LEGAL_PRODUCTION_READY', value: legalProductionReady }
  { name: 'LEGAL_RECORD_RETENTION_YEARS', value: legalRecordRetentionYears }
  { name: 'LEGAL_RECORD_RETENTION_BASIS_CONFIRMED', value: legalRecordRetentionBasisConfirmed }
  { name: 'LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION', value: legalBusinessRegistrationLegalConfirmation }
]

var legalEnv = concat(
  !empty(legalOperatorName) ? [{ name: 'LEGAL_OPERATOR_NAME', secretRef: 'legal-operator-name' }] : [],
  !empty(legalOperatorAddress) ? [{ name: 'LEGAL_OPERATOR_ADDRESS', secretRef: 'legal-operator-address' }] : [],
  !empty(legalPublicationDirector) ? [{ name: 'LEGAL_PUBLICATION_DIRECTOR', secretRef: 'legal-publication-director' }] : [],
  !empty(legalHostName) ? [{ name: 'LEGAL_HOST_NAME', secretRef: 'legal-host-name' }] : [],
  !empty(legalHostAddress) ? [{ name: 'LEGAL_HOST_ADDRESS', secretRef: 'legal-host-address' }] : [],
  !empty(legalHostPhone) ? [{ name: 'LEGAL_HOST_PHONE', secretRef: 'legal-host-phone' }] : [],
  !empty(legalContactEmail) ? [{ name: 'LEGAL_CONTACT_EMAIL', secretRef: 'legal-contact-email' }] : [],
  !empty(legalContactPhone) ? [{ name: 'LEGAL_CONTACT_PHONE', secretRef: 'legal-contact-phone' }] : [],
  !empty(legalPrivacyEmail) ? [{ name: 'LEGAL_PRIVACY_EMAIL', secretRef: 'legal-privacy-email' }] : [],
  !empty(legalWithdrawalEmail) ? [{ name: 'LEGAL_WITHDRAWAL_EMAIL', secretRef: 'legal-withdrawal-email' }] : [],
  !empty(legalFrMediatorName) ? [{ name: 'LEGAL_FR_MEDIATOR_NAME', secretRef: 'legal-fr-mediator-name' }] : [],
  !empty(legalFrMediatorAddress) ? [{ name: 'LEGAL_FR_MEDIATOR_ADDRESS', secretRef: 'legal-fr-mediator-address' }] : [],
  !empty(legalFrMediatorUrl) ? [{ name: 'LEGAL_FR_MEDIATOR_URL', secretRef: 'legal-fr-mediator-url' }] : [],
  !empty(legalBusinessRegistrationStatus) ? [{ name: 'LEGAL_BUSINESS_REGISTRATION_STATUS', secretRef: 'legal-business-registration-status' }] : [],
  !empty(legalKvkNumber) ? [{ name: 'LEGAL_KVK_NUMBER', secretRef: 'legal-kvk-number' }] : [],
  !empty(legalVatStatus) ? [{ name: 'LEGAL_VAT_STATUS', secretRef: 'legal-vat-status' }] : [],
  !empty(legalVatId) ? [{ name: 'LEGAL_VAT_ID', secretRef: 'legal-vat-id' }] : []
)

var stripeEnv = concat(
  !empty(stripeSecretKey) ? [
    {
      name: 'STRIPE_SECRET_KEY'
      secretRef: 'stripe-secret-key'
    }
  ] : [],
  !empty(stripeWebhookSecret) ? [
    {
      name: 'STRIPE_WEBHOOK_SECRET'
      secretRef: 'stripe-webhook-secret'
    }
  ] : []
)

var deploymentTraffic = empty(stableRevisionName)
  ? [
      {
        latestRevision: true
        weight: 100
      }
    ]
  : [
      {
        revisionName: stableRevisionName
        weight: 100
      }
    ]

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: resourceGroup().location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: containerEnvironment.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      secrets: appSecrets
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
        traffic: deploymentTraffic
        customDomains: [
          {
            name: apexHostname
            bindingType: 'SniEnabled'
            certificateId: apexCertificate.id
          }
          {
            name: wwwHostname
            bindingType: 'SniEnabled'
            certificateId: wwwCertificate.id
          }
        ]
      }
      registries: [
        {
          identity: identity.id
          server: registry.properties.loginServer
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: containerImage
          env: concat(baseEnv, stripeEnv, legalEnv)
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

resource retentionCleanupJob 'Microsoft.App/jobs@2025-01-01' = {
  name: retentionCleanupJobName
  location: resourceGroup().location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${retentionIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerEnvironment.id
    configuration: {
      registries: [
        {
          identity: retentionIdentity.id
          server: registry.properties.loginServer
        }
      ]
      replicaRetryLimit: 2
      replicaTimeout: 300
      scheduleTriggerConfig: {
        cronExpression: retentionCleanupCronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
      triggerType: 'Schedule'
    }
    template: {
      containers: [
        {
          name: 'retention-cleanup'
          image: containerImage
          command: [ 'node' ]
          args: [ 'server-dist/server/retention-cleanup.js' ]
          env: [
            { name: 'AZURE_STORAGE_ACCOUNT_URL', value: 'https://${storageAccountName}.blob.${environment().suffixes.storage}' }
            { name: 'AZURE_CLIENT_ID', value: retentionIdentity.properties.clientId }
            { name: 'AUTH_USERS_TABLE', value: authUsersTableName }
            { name: 'AUTH_CODES_TABLE', value: authCodesTableName }
            { name: 'AUTH_SESSIONS_TABLE', value: authSessionsTableName }
            { name: 'RETENTION_CLEANUP_MAX_DELETES', value: '10000' }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

output appName string = app.name
output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output retentionCleanupJobName string = retentionCleanupJob.name
