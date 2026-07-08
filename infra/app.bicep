@description('Full image reference in Azure Container Registry.')
param containerImage string

param appName string = 'airco-tracking-web'
param containerEnvironmentName string
param acrName string
param identityName string
param storageAccountName string
param communicationServiceName string = ''
param authEmailFrom string = ''

param authUsersTableName string = 'users'
param authCodesTableName string = 'authcodes'
param authSessionsTableName string = 'authsessions'

param appBaseUrl string = 'https://airco-tracker.eu'
@secure()
param stripeSecretKey string = ''
@secure()
param stripeWebhookSecret string = ''
param stripePriceWeeklyBasic string = ''
param stripePriceWeeklyPriority string = ''
param stripePriceMonthlyBasic string = ''
param stripePriceMonthlyPriority string = ''

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
  name: identityName
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
  { name: 'AUTH_EMAIL_ENDPOINT', value: empty(communicationServiceName) ? '' : 'https://${communicationServiceName}.communication.azure.com' }
  { name: 'AUTH_EMAIL_FROM', value: authEmailFrom }
  { name: 'AUTH_COOKIE_SECURE', value: 'true' }
  { name: 'AUTH_CODE_TTL_SECONDS', value: '600' }
  { name: 'AUTH_CODE_RESEND_SECONDS', value: '60' }
  { name: 'AUTH_CODE_MAX_ATTEMPTS', value: '5' }
  { name: 'AUTH_SESSION_TTL_SECONDS', value: '2592000' }
  { name: 'APP_BASE_URL', value: appBaseUrl }
  { name: 'STRIPE_PRICE_WEEKLY_BASIC', value: stripePriceWeeklyBasic }
  { name: 'STRIPE_PRICE_WEEKLY_PRIORITY', value: stripePriceWeeklyPriority }
  { name: 'STRIPE_PRICE_MONTHLY_BASIC', value: stripePriceMonthlyBasic }
  { name: 'STRIPE_PRICE_MONTHLY_PRIORITY', value: stripePriceMonthlyPriority }
]

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
      activeRevisionsMode: 'Single'
      secrets: stripeSecrets
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
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
          env: concat(baseEnv, stripeEnv)
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

output appName string = app.name
output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
