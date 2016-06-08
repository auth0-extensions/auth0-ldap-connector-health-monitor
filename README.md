# Auth0 - AD/LDAP Connector Health Webtask

[![Auth0 Extensions](http://cdn.auth0.com/extensions/assets/badge.svg)](https://sandbox.it.auth0.com/api/run/auth0-extensions/extensions-badge?webtask_no_cache=1)

This extension will expose an endpoint you can use from your monitoring tool to monitor your AD/LDAP Connectors

## Deploy to Webtask.io

```
npm i -g wt-cli
wt init
wt create https://raw.githubusercontent.com/auth0/auth0-ldap-conector-health-monitor/master/index.js \
    --name auth0-ldap-connector-health-monitor \
    --secret AUTH0_DOMAIN="YOUR_AUTH0_DOMAIN" \
    --secret AUTH0_GLOBAL_CLIENT_ID="YOUR_AUTH0_GLOBAL_CLIENT_ID" \
    --secret AUTH0_GLOBAL_CLIENT_SECRET="YOUR_AUTH0_GLOBAL_CLIENT_SECRET"
```

> You can get your Global Client Id/Secret here: https://auth0.com/docs/api/v1

## Usage

Once the task has been deployed you can monitor any connector in your account by calling the task like this:

```
GET https://webtask.it.auth0.com/api/run/{YOUR_CONTAINER_NAME}/ldap-connector-health?connection=my-ldap-store
GET https://webtask.it.auth0.com/api/run/{YOUR_CONTAINER_NAME}/ldap-connector-health?connection=my-other-connector
```

Where `connection` is the name of the **AD/LDAP** Connection in Auth0.

The webtask will return the following:

 - **500**: Infrastructure error (configuration missing, authentication error, ...).
 - **400**: Connector is offline.
 - **200**: Connector is online.

Since the webtask is now handling the "complex logic" (authentication, parsing the response, ...) you can now use any monitoring service like Pingdom, SCOM, Runscope, ... to monitor your AD Connections.

> Note: This assumes you use the cluster from Webtask.io, if you use your Auth0 container make sure to call sandbox.it.auth0.com instead of webtask.it.auth0.com

## Issue Reporting

If you have found a bug or if you have a feature request, please report them at this repository issues section. Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/whitehat) details the procedure for disclosing security issues.

## Author

[Auth0](auth0.com)

## What is Auth0?

Auth0 helps you to:

* Add authentication with [multiple authentication sources](https://docs.auth0.com/identityproviders), either social like **Google, Facebook, Microsoft Account, LinkedIn, GitHub, Twitter, Box, Salesforce, amont others**, or enterprise identity systems like **Windows Azure AD, Google Apps, Active Directory, ADFS or any SAML Identity Provider**.
* Add authentication through more traditional **[username/password databases](https://docs.auth0.com/mysql-connection-tutorial)**.
* Add support for **[linking different user accounts](https://docs.auth0.com/link-accounts)** with the same user.
* Support for generating signed [Json Web Tokens](https://docs.auth0.com/jwt) to call your APIs and **flow the user identity** securely.
* Analytics of how, when and where users are logging in.
* Pull data from other sources and add it to the user profile, through [JavaScript rules](https://docs.auth0.com/rules).

## Create a free Auth0 Account

1. Go to [Auth0](https://auth0.com) and click Sign Up.
2. Use Google, GitHub or Microsoft Account to login.

## License

This project is licensed under the MIT license. See the [LICENSE](LICENSE) file for more info.
