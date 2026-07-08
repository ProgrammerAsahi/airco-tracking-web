# Testscenario's voor abonnementen en Stripe-betalingen

<p align="center">
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.md"><img alt="简体中文" src="https://img.shields.io/badge/docs-简体中文-d73a49"></a>
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.en.md"><img alt="English" src="https://img.shields.io/badge/docs-English-0969da"></a>
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.nl.md"><img alt="Nederlands" src="https://img.shields.io/badge/docs-Nederlands-f58220"></a>
</p>

Laatst bijgewerkt: 2026-07-08

## Onderhoudsregel

Dit document houdt end-to-endtests bij voor de portal, login, abonnementen, Stripe-betalingen en toegangsrechten voor voorraadpagina's. Wanneer een scenario, status of testnotitie wordt toegevoegd of gewijzigd, moeten alle drie taalversies tegelijk worden bijgewerkt:

- `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md`
- `docs/SUBSCRIPTION_BILLING_TEST_PLAN.en.md`
- `docs/SUBSCRIPTION_BILLING_TEST_PLAN.nl.md`

Statusmarkeringen:

- ✅ Voltooid en geverifieerd
- ⬜ Nog niet getest
- 🚧 Vereist eerst implementatie of functionele bevestiging

## Huidige testomgeving

- Productiesite: [https://airco-tracker.eu](https://airco-tracker.eu)
- Stripe-modus: Sandbox / testmodus
- Stripe-webhook: `https://airco-tracker.eu/api/billing/webhook`
- Abonnementen:

| Intern plan | Weergavenaam | Prijs | Stripe Price ID |
| --- | --- | --- | --- |
| `weekly_basic` | Weekabonnement · voorraadmeldingen | €10 / week | `price_1Tqti10XRx7WeBOsbaTiCY5v` |
| `weekly_priority` | Weekabonnement · realtime radar | €20 / week | `price_1TqtlM0XRx7WeBOsaBF2uQSo` |
| `monthly_basic` | Maandabonnement · voorraadmeldingen | €15 / maand | `price_1Tqtj20XRx7WeBOsdnuL3Hwb` |
| `monthly_priority` | Maandabonnement · realtime radar | €30 / maand | `price_1Tqtm80XRx7WeBOsvTwtW4nM` |

## P0: Aankoop, terugkeerflow en rechten

| Status | Scenario | Verwacht resultaat | Notities |
| --- | --- | --- | --- |
| ⬜ | Niet-ingelogde gebruiker klikt op “Plan kiezen” op `/subscribe` | Eerst verschijnt de loginkaart; na login gaat het gekozen plan door naar betaling | De oude balk “Log in voordat je een plan kiest / Terug naar homepage” mag niet verschijnen |
| ⬜ | Ingelogde gebruiker klikt op “Plan kiezen” op `/subscribe` | De gebruiker gaat direct naar Stripe Checkout of de betaalkaart, zonder nieuwe loginprompt | Test alle vier plannen |
| ✅ | `monthly_priority` kopen met een testkaart | Stripe Checkout slaagt; na terugkeer naar de site krijgt de gebruiker `monthly_priority`-rechten | Voltooid op 2026-07-08 met een testkaart; abonnementsstatus verscheen correct na verversen |
| ⬜ | `weekly_priority` kopen met een testkaart | De gebruiker krijgt één week toegang tot realtime voorraad | Nog niet getest |
| ⬜ | `weekly_basic` kopen met een testkaart | De gebruiker krijgt alleen voorraadmeldingen per e-mail en geen toegang tot realtime voorraadpagina's | Nog niet getest |
| ⬜ | `monthly_basic` kopen met een testkaart | De gebruiker krijgt alleen voorraadmeldingen per e-mail en geen toegang tot realtime voorraadpagina's | Nog niet getest |
| ⬜ | Checkout annuleren of teruggaan tijdens betaling | De gebruiker keert terug naar de abonnementspagina; de database toont nog steeds geen actief abonnement; rechten worden niet per ongeluk toegekend | Nog niet getest |
| ⬜ | Na succesvolle betaling wachten op terugkeersynchronisatie zonder te verversen | De pagina synchroniseert automatisch de Stripe checkout session en toont de juiste rechten | Fix is uitgerold; vereist een nieuwe betaling om te verifiëren |
| ✅ | Verversen na succesvolle betaling | Abonnementsstatus blijft correct zichtbaar | Geverifieerd in productie op 2026-07-08 |
| ⬜ | Gebruiker met actief abonnement kiest opnieuw een gelijkwaardig plan | Het systeem maakt geen dubbele actieve abonnementen; het toont het bestaande abonnement of start de wijzigingsflow | Nog niet getest |

## P0: Opzegging, verlenging en planwijzigingen

| Status | Scenario | Verwacht resultaat | Notities |
| --- | --- | --- | --- |
| ⬜ | Gebruiker zegt het huidige abonnement op | Stripe wordt ingesteld op opzeggen aan het einde van de periode; rechten blijven actief tot het einde van de huidige periode | Aanbevolen volgende test |
| ⬜ | Profile openen na opzegging | Profile toont opzegstatus en einddatum van rechten; betaalsamenvatting blijft zichtbaar | Nog niet getest |
| ⬜ | Rechtenpagina's openen na opzegging | De gekochte rechten blijven bruikbaar vóór het einde van de periode | Nog niet getest; kan met Stripe Test Clock |
| ⬜ | Rechtenpagina's openen na het einde van de periode | Abonnement verloopt; realtime voorraadtoegang sluit; gebruiker kan opnieuw abonneren | Nog niet getest; kan met Stripe Test Clock |
| 🚧 | Upgrade van voorraadmeldingen naar realtime radar | Upgrade moet direct actief worden | Stripe subscription update-flow moet nog worden bevestigd/geïmplementeerd |
| 🚧 | Downgrade van realtime radar naar voorraadmeldingen | Downgrade gaat pas aan het einde van de periode in, terwijl huidige rechten actief blijven | Stripe subscription schedule of pending update-flow moet nog worden bevestigd/geïmplementeerd |
| 🚧 | Wisselen tussen week- en maandfacturatie | Voer het gekozen productbeleid uit zonder dubbele abonnementen te maken | Productbeleid moet eerst worden vastgesteld |

## P0: Voorraadtoegang, land en taal

| Status | Scenario | Verwacht resultaat | Notities |
| --- | --- | --- | --- |
| ⬜ | Niet-ingelogde gebruiker opent `/deliver-to/nl` of `/deliver-to/fr` | Voorraadgegevens zijn verborgen; gebruiker wordt naar login of abonnement geleid | Nog niet getest |
| ⬜ | Gebruiker zonder abonnement opent `/deliver-to/nl` of `/deliver-to/fr` | Voorraadgegevens zijn verborgen; gebruiker wordt naar abonnement geleid | Nog niet getest |
| ⬜ | `basic`-gebruiker opent realtime voorraadpagina | Voorraadgegevens zijn verborgen; pagina legt uit dat het plan alleen e-mailmeldingen bevat | Nog niet getest |
| ⬜ | `priority`-gebruiker opent realtime voorraadpagina | Gebruiker komt op `/deliver-to/nl` of `/deliver-to/fr` op basis van opgeslagen land en ziet winkels die kunnen leveren | Nog niet getest |
| ⬜ | Taal wisselen op de Ready-pagina | Chinees, Engels en Nederlands wisselen direct zonder bezorgland te veranderen | Nog niet getest |
| ⬜ | Taal wisselen op `/deliver-to/*` | Chinees, Engels en Nederlands wisselen direct zonder bezorgland te veranderen | Gebruiker vond eerder een probleem; regressietest nodig na fix |
| ⬜ | Land wijzigen in Profile | Na bevestiging verandert het opgeslagen land en gebruiken toekomstige voorraadlinks dat land | Nog niet getest |

## P0: Stripe-webhook en synchronisatiebeveiliging

| Status | Scenario | Verwacht resultaat | Notities |
| --- | --- | --- | --- |
| ✅ | Webhook aanroepen zonder Stripe-handtekening | Geeft 400 terug en verwerkt geen statuswijziging | Geverifieerd in productie op 2026-07-08 |
| ⬜ | `checkout.session.completed` webhook | Koppelt de huidige gebruiker, Stripe customer en subscription correct | Vereist een nieuwe checkout om te verifiëren |
| ⬜ | `customer.subscription.updated` webhook | Werkt plan, status, opzeggingsvlag, periode-einde en betaalsamenvatting correct bij | Nog niet getest |
| ⬜ | `customer.subscription.deleted` webhook | Verwijdert rechten correct en bewaart noodzakelijke historische gegevens | Nog niet getest |
| ⬜ | Webhook is vertraagd of gemist en gebruiker keert terug uit Checkout | `/api/billing/sync-checkout-status` haalt status uit Stripe en herstelt de database | Fix is uitgerold; vereist een nieuwe checkout om te verifiëren |
| 🚧 | Dubbele webhook-events | Dubbele events mogen geen gevaarlijke herhaalde writes of dubbele abonnementen veroorzaken | Controleer of een tabel voor event-deduplicatie nodig is |
| ⬜ | Ingelogde gebruiker probeert checkout session van een ander te synchroniseren | Backend weigert het verzoek en lekt geen abonnementsgegevens | Nog niet getest |
| ✅ | Niet-ingelogde gebruiker roept checkout sync API aan | Geeft 401 terug | Geverifieerd in productie op 2026-07-08 |

## P1: Profiel, e-mail en accountlevenscyclus

| Status | Scenario | Verwacht resultaat | Notities |
| --- | --- | --- | --- |
| ⬜ | Nieuwe gebruiker registreert met e-mailcode | Gebruiker wordt alleen aangemaakt/ingelogd met geldige code; eerste login opent de nickname-kaart | Nog niet getest |
| ⬜ | Aftelknop voor code verzenden | Na klikken is de knop 60 seconden uitgeschakeld; daarna kan opnieuw worden verzonden | Test zowel registratie als e-mailwijziging |
| ⬜ | Nickname wijzigen | De kaart “Hoe mogen we je noemen?” opent; na opslaan worden avatarinitialen bijgewerkt | Nog niet getest |
| ⬜ | E-mail wijzigen | Na verificatie van de nieuwe e-mailcode blijft stabiele user ID gelijk en wordt het e-mailveld bijgewerkt | Nog niet getest |
| ⬜ | Account verwijderen met actief abonnement | Backend weigert verwijdering en legt uit dat eerst opzegging en verlopen rechten nodig zijn | Nog niet getest |
| ⬜ | Account verwijderen zonder abonnement of na verlopen abonnement | Gebruikersprofiel en sessies worden opgeschoond; betaalde rechten zijn niet meer toegankelijk | Nog niet getest |
| ⬜ | Uitloggen en opnieuw inloggen | Abonnement, land, taal, nickname en betaalsamenvatting blijven correct | Nog niet getest |

## P1: Betalingsfouten en randgevallen

| Status | Scenario | Verwacht resultaat | Notities |
| --- | --- | --- | --- |
| ⬜ | Stripe-testkaart mislukt | Gebruiker heeft nog steeds geen abonnement; pagina toont begrijpelijke fout/herhaalstatus | Nog niet getest |
| ⬜ | Testkaart vereist 3D Secure | Succesvolle authenticatie kent rechten toe; mislukte authenticatie niet | Nog niet getest |
| ⬜ | Checkout session verloopt | Terugkerende gebruiker ziet een status waarmee opnieuw een plan gekozen kan worden | Nog niet getest |
| ⬜ | Tijdelijke Stripe API-storing | Frontend toont retry/foutstatus; database schrijft geen half-actief abonnement | Nog niet getest |
| ⬜ | Gebruiker start betalingen in meerdere tabbladen | Eindstatus bevat slechts één geldig abonnement en overschrijft data niet verkeerd | Nog niet getest |

## P2: Productieregressie na release

| Status | Scenario | Verwacht resultaat | Notities |
| --- | --- | --- | --- |
| ✅ | `/health` | Geeft 200 terug | Geverifieerd in productie op 2026-07-08 |
| ✅ | `/ready?lang=zh` | Geeft 200 terug | Geverifieerd in productie op 2026-07-08 |
| ✅ | Nieuwste frontend-bundle wordt door productie geladen | Browser laadt het nieuwe build-artifact | Nieuwe bundle gezien op 2026-07-08 |
| ⬜ | `/subscribe?lang=zh/en/nl` | Alle drie taalpagina's laden en planknoppen gedragen zich hetzelfde | Nog niet getest |
| ⬜ | `/profile?lang=zh/en/nl` | Alle drie taalpagina's laden met consistente profiel- en abonnementskaarten | Nog niet getest |
| ⬜ | `/deliver-to/nl?lang=zh/en/nl` | Alle drie voorraadpagina's laden en taalwissel werkt | Nog niet getest |
| ⬜ | `/deliver-to/fr?lang=zh/en/nl` | Alle drie voorraadpagina's laden en taalwissel werkt | Nog niet getest |

## Aanbevolen testvolgorde

1. Test eerst de opzegging van het huidige `monthly_priority`-abonnement.
2. Voer daarna met een nieuwe gebruiker één volledige aankoop uit om automatische synchronisatie zonder verversen te verifiëren.
3. Koop `weekly_basic`, `monthly_basic` en `weekly_priority` afzonderlijk om rechtenverschillen te bevestigen.
4. Gebruik Stripe Test Clock voor periode-einde, opzegging na periode en verlenging.
5. Test upgrades, downgrades en week/maandwissels nadat de planwijzigingsflow is geïmplementeerd/bevestigd.
