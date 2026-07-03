@description('GitHub repository in owner/name format.')
param githubRepository string = 'ProgrammerAsahi/airco-tracking-web'

@description('Only this branch is allowed to deploy.')
param githubBranch string = 'main'

param deployIdentityName string = 'airco-github-deployer'

resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: deployIdentityName
}

resource githubCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-${uniqueString(githubRepository, githubBranch)}'
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:ref:refs/heads/${githubBranch}'
  }
}

output clientId string = deployIdentity.properties.clientId
output subscriptionId string = subscription().subscriptionId
output tenantId string = tenant().tenantId
