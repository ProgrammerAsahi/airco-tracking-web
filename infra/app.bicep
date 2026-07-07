@description('Full image reference in Azure Container Registry.')
param containerImage string

param appName string = 'airco-tracking-web'
param containerEnvironmentName string
param acrName string
param identityName string
param storageAccountName string

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
          env: [
            { name: 'PORT', value: '3000' }
            { name: 'AZURE_STORAGE_ACCOUNT_URL', value: 'https://${storageAccountName}.blob.${environment().suffixes.storage}' }
            { name: 'AZURE_STORAGE_CONTAINER', value: 'airco-tracker' }
            { name: 'AZURE_INVENTORY_BLOB', value: 'inventory.json' }
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
            { name: 'INVENTORY_CACHE_SECONDS', value: '30' }
          ]
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
