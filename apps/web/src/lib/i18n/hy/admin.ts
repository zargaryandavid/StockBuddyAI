/** Armenian (admin). Keys are the exact English text shown in the app. */
const admin: Record<string, string> = {
  // Header and sections
  Portfolio: "Պորտֆել",
  Admin: "Ադմին",
  "Admin sections": "Ադմինի բաժիններ",
  "Studio settings": "Ստուդիայի կարգավորումներ",
  Education: "Կրթություն",
  Connections: "Միացումներ",

  // Studio
  "Admin studio": "Ադմինի ստուդիա",
  "Could not load the studio": "Չհաջողվեց բեռնել ստուդիան",
  "Persona prompts and the limits that apply to every user.":
    "Կերպարների հրահանգները և բոլոր օգտատերերի համար գործող սահմանաչափերը։",
  "Saving…": "Պահպանվում է…",
  "Save studio": "Պահպանել ստուդիան",
  "Studio settings saved. The next review uses them.":
    "Ստուդիայի կարգավորումները պահպանվեցին։ Հաջորդ վերանայումը կօգտագործի դրանք։",
  "Could not save studio settings": "Չհաջողվեց պահպանել ստուդիայի կարգավորումները",
  "Book settings": "Պորտֆելի կարգավորումներ",
  "Limits and model": "Սահմանաչափեր և մոդել",
  "Maximum position %": "Դիրքի առավելագույն %",
  "Industry position %": "Ոլորտի դիրքի %",
  "Deep value sleeve %": "Խորքային արժեքի մաս %",
  "Trajectory sleeve %": "Հետագծի մաս %",
  "Review model": "Վերանայման մոդել",
  "Uses the {provider} key from Connections. Save to apply.":
    "Օգտագործում է {provider}-ի բանալին «Միացումներ» բաժնից։ Պահպանեք՝ կիրառելու համար։",
  "Uses the key for this model's provider from Connections.":
    "Օգտագործում է այս մոդելի մատակարարի բանալին «Միացումներ» բաժնից։",
  "Use transaction history in Analytics": "Օգտագործել գործարքների պատմությունը «Վերլուծություն» բաժնում",
  Costs: "Ծախսեր",
  "AI limits per person": "AI սահմանաչափեր մեկ անձի համար",
  "Ask Buddy tokens are per month and reset on the 1st; the other features reset every day. 0 turns a feature off.":
    "«Հարցրեք Buddy-ին» թոքենները ամսական են և վերականգնվում են ամսի 1-ին, մյուս գործառույթները՝ ամեն օր։ 0-ն անջատում է գործառույթը։",
  "Wish repeat checks per day": "Ցանկությունների կրկնության ստուգումներ օրական",
  "Screenshot imports per day": "Սքրինշոթների ներմուծումներ օրական",
  "Ask Buddy tokens per month": "«Հարցրեք Buddy-ին» թոքեններ ամսական",
  Sectors: "Ոլորտներ",
  "Industry list": "Ոլորտների ցանկ",
  "+ Add industry": "+ Ավելացնել ոլորտ",
  "Industry name {number}": "Ոլորտի անվանում {number}",
  "Industry name": "Ոլորտի անվանում",
  "Remove {name}": "Հեռացնել «{name}»",
  "Remove industry {number}": "Հեռացնել ոլորտ {number}",
  "Persona prompts": "Կերպարների հրահանգներ",
  "deep-value": "խորքային արժեք",
  trajectory: "հետագիծ",
  "Restore built-in": "Վերականգնել ներկառուցվածը",
  "System prompt": "Համակարգային հրահանգ",

  // Reset my tokens
  Testing: "Թեստավորում",
  "Clears this month's Ask Buddy tokens and today's other AI use, for your own account only.":
    "Զրոյացնում է այս ամսվա «Հարցրեք Buddy-ին» թոքենները և այսօրվա մյուս AI օգտագործումը՝ միայն ձեր հաշվի համար։",
  "Resetting…": "Վերակայվում է…",
  "Reset my tokens": "Վերակայել իմ թոքենները",
  "Done. Your AI tokens are full again.": "Պատրաստ է։ Ձեր AI թոքենները կրկին լիքն են։",
  "Could not reset your tokens": "Չհաջողվեց վերակայել ձեր թոքենները",

  // Connections page
  "Outside services StockBuddy uses. Values saved here override the server config (.env).":
    "Արտաքին ծառայություններ, որոնք օգտագործում է StockBuddy-ն։ Այստեղ պահպանված արժեքները գերակայում են սերվերի կարգավորումներին (.env)։",
  "Testing…": "Ստուգվում է…",
  "Test all": "Ստուգել բոլորը",
  Test: "Ստուգել",
  "Test failed": "Ստուգումը ձախողվեց",
  "Loading connections…": "Միացումները բեռնվում են…",
  "Could not load connections": "Չհաջողվեց բեռնել միացումները",
  "Could not save": "Չհաջողվեց պահպանել",
  Working: "Աշխատում է",
  "Not working": "Չի աշխատում",
  "Not set up": "Կարգավորված չէ",
  "Not tested": "Ստուգված չէ",
  "Saved in Admin": "Պահպանված է Ադմինում",
  "From server config": "Սերվերի կարգավորումներից",
  Default: "Լռելյայն",
  "Not set": "Նշված չէ",
  "Saved: {hint} (type to replace)": "Պահպանված է՝ {hint} (մուտքագրեք՝ փոխարինելու համար)",
  "The saved value can't be read anymore; enter it again.":
    "Պահպանված արժեքն այլևս հնարավոր չէ կարդալ։ Մուտքագրեք այն կրկին։",
  "Save & test": "Պահպանել և ստուգել",
  "Discard changes": "Չեղարկել փոփոխությունները",
  "Remove the values saved in Admin for {name} and use the server config instead?":
    "Հեռացնե՞լ Ադմինում պահպանված արժեքները ({name}) և օգտագործել սերվերի կարգավորումները։",
  "Use server config": "Օգտագործել սերվերի կարգավորումները",
  "{ms} ms": "{ms} մվ",

  // Connections from the API: names
  "Email (SMTP)": "Էլ. փոստ (SMTP)",
  "Payments (Stripe)": "Վճարումներ (Stripe)",
  "Market data (Yahoo Finance)": "Շուկայական տվյալներ (Yahoo Finance)",
  "Picture storage (Supabase)": "Նկարների պահոց (Supabase)",

  // Connections from the API: purposes
  "AI persona review on Run test, and the repeat check in the 300 wishes.":
    "AI կերպարների վերանայումը թեստի գործարկման ժամանակ և 300 ցանկություններում կրկնության ստուգումը։",
  "Reading holdings from a portfolio screenshot, and the persona review when Admin studio uses an OpenAI model.":
    "Դիրքերի ընթերցումը պորտֆելի սքրինշոթից և կերպարների վերանայումը, երբ Ադմինի ստուդիան օգտագործում է OpenAI մոդել։",
  "Report-date reminder emails.": "Հաշվետվությունների ամսաթվերի մասին հիշեցման նամակներ։",
  "Buying AI tokens. Not live yet: saving keys here does not turn buying on.":
    "AI թոքենների գնում։ Դեռ գործարկված չէ․ այստեղ բանալիներ պահպանելը գնումը չի միացնում։",
  "Company names, sectors, and report dates. The SEC asks for a contact email.":
    "Ընկերությունների անվանումներ, ոլորտներ և հաշվետվությունների ամսաթվեր։ SEC-ը պահանջում է կոնտակտային էլ. փոստ։",
  "Prices and history for holdings and benchmarks. No key needed.":
    "Դիրքերի և համեմատական ցուցանիշների գներն ու պատմությունը։ Բանալի պետք չէ։",
  "Pictures for Education articles. Set up by the database migrations.":
    "Նկարներ «Կրթություն» բաժնի հոդվածների համար։ Կարգավորվում է տվյալների բազայի միգրացիաներով։",

  // Connections from the API: fields and help
  "API key": "API բանալի",
  "From console.anthropic.com → API keys.": "console.anthropic.com → API keys բաժնից։",
  "Screenshot model": "Սքրինշոթների մոդել",
  "SMTP server": "SMTP սերվեր",
  Port: "Պորտ",
  Username: "Օգտանուն",
  Password: "Գաղտնաբառ",
  "For Gmail, use an app password.": "Gmail-ի համար օգտագործեք հավելվածի գաղտնաբառ։",
  "Send from": "Ուղարկող",
  "Use STARTTLS": "Օգտագործել STARTTLS",
  "Secret key": "Գաղտնի բանալի",
  "From dashboard.stripe.com → Developers → API keys. Use test keys while testing.":
    "dashboard.stripe.com → Developers → API keys բաժնից։ Թեստավորման ընթացքում օգտագործեք թեստային բանալիներ։",
  "Publishable key": "Հրապարակային բանալի",
  "Safe to show in the browser; must match the secret key's mode.":
    "Կարելի է ցուցադրել դիտարկիչում։ Պետք է համապատասխանի գաղտնի բանալու ռեժիմին։",
  "Webhook signing secret": "Webhook-ի ստորագրման գաղտնիք",
  "From Developers → Webhooks after adding the endpoint.":
    "Developers → Webhooks բաժնից՝ endpoint-ն ավելացնելուց հետո։",
  "Contact (app name and email)": "Կոնտակտ (հավելվածի անվանում և էլ. փոստ)",

  // Connection test results and save errors from the API
  "Anthropic rejected the API key (invalid or revoked).":
    "Anthropic-ը մերժեց API բանալին (անվավեր է կամ չեղարկված)։",
  "The key works, but this account can't use the model set in Admin studio.":
    "Բանալին աշխատում է, բայց այս հաշիվը չի կարող օգտագործել Ադմինի ստուդիայում ընտրված մոդելը։",
  "The email server rejected the username or password.":
    "Էլ. փոստի սերվերը մերժեց օգտանունը կամ գաղտնաբառը։",
  "Nothing answered at that address and port. Check the server and port.":
    "Այդ հասցեում և պորտում ոչինչ չպատասխանեց։ Ստուգեք սերվերը և պորտը։",
  "The service took too long to answer. Try again, or check the address.":
    "Ծառայությունը չափազանց երկար չպատասխանեց։ Փորձեք կրկին կամ ստուգեք հասցեն։",
  "Could not reach the service: {detail}": "Չհաջողվեց կապվել ծառայության հետ՝ {detail}",
  "No API key is set.": "API բանալի նշված չէ։",
  "Key works. {model} is available.": "Բանալին աշխատում է։ {model} մոդելը հասանելի է։",
  "OpenAI rejected the API key (invalid or revoked).":
    "OpenAI-ը մերժեց API բանալին (անվավեր է կամ չեղարկված)։",
  "The key works, but the model {model} isn't available.":
    "Բանալին աշխատում է, բայց {model} մոդելը հասանելի չէ։",
  "Set the SMTP server and the Send from address.": "Նշեք SMTP սերվերը և ուղարկողի հասցեն։",
  "Connected to {server} and signed in. Reminders can be sent.":
    "Միացված է {server} սերվերին, մուտքը կատարված է։ Հիշեցումները կարելի է ուղարկել։",
  "Connected to {server}. Reminders can be sent.":
    "Միացված է {server} սերվերին։ Հիշեցումները կարելի է ուղարկել։",
  "The contact must include an email address.": "Կոնտակտը պետք է պարունակի էլ. փոստի հասցե։",
  "The SEC refused the request; check the contact name and email.":
    "SEC-ը մերժեց հարցումը։ Ստուգեք կոնտակտային անունը և էլ. փոստը։",
  "The SEC answered. Company data and report dates can load.":
    "SEC-ը պատասխանեց։ Ընկերությունների տվյալները և հաշվետվությունների ամսաթվերը կարող են բեռնվել։",
  "No secret key is set.": "Գաղտնի բանալի նշված չէ։",
  "That isn't a Stripe secret key (sk_test_… or sk_live_…).":
    "Սա Stripe-ի գաղտնի բանալի չէ (sk_test_… կամ sk_live_…)։",
  "The publishable key should start with pk_test_ or pk_live_.":
    "Հրապարակային բանալին պետք է սկսվի pk_test_ կամ pk_live_ նախածանցով։",
  "The secret and publishable keys are from different modes (test and live).":
    "Գաղտնի և հրապարակային բանալիները տարբեր ռեժիմներից են (թեստային և իրական)։",
  "The webhook signing secret should start with whsec_.":
    "Webhook-ի ստորագրման գաղտնիքը պետք է սկսվի whsec_ նախածանցով։",
  "Stripe rejected the secret key (invalid or revoked).":
    "Stripe-ը մերժեց գաղտնի բանալին (անվավեր է կամ չեղարկված)։",
  "This restricted key can't read the balance; allow Balance: Read.":
    "Այս սահմանափակ բանալին չի կարող կարդալ մնացորդը։ Թույլատրեք Balance: Read իրավունքը։",
  "Key works (test mode).": "Բանալին աշխատում է (թեստային ռեժիմ)։",
  "Key works (live mode).": "Բանալին աշխատում է (իրական ռեժիմ)։",
  "Still to add: {items}.": "Դեռ պետք է ավելացնել՝ {items}։",
  "publishable key": "հրապարակային բանալի",
  "webhook signing secret": "webhook-ի ստորագրման գաղտնիք",
  "Yahoo Finance returned no prices for SPY.": "Yahoo Finance-ը SPY-ի համար գներ չվերադարձրեց։",
  "Prices load. SPY closed at {close} on {date}.":
    "Գները բեռնվում են։ SPY-ի փակման գինը {date}-ին՝ {close}։",
  "The education picture bucket is missing; run the migrations.":
    "Կրթության նկարների պահոցը (bucket) բացակայում է։ Գործարկեք միգրացիաները։",
  "The education picture bucket is ready.": "Կրթության նկարների պահոցը (bucket) պատրաստ է։",
  "{field} must be on or off": "«{field}» դաշտը պետք է լինի միացված կամ անջատված",
  "{field} can't be empty; clear it to use .env instead":
    "«{field}» դաշտը չի կարող դատարկ լինել։ .env-ն օգտագործելու համար մաքրեք այն",
  "{field} is too long": "«{field}» դաշտը չափազանց երկար է",
  "{field} must include an email address": "«{field}» դաշտը պետք է պարունակի էլ. փոստի հասցե",
  "Port must be a number from 1 to 65535": "Պորտը պետք է լինի 1-ից 65535 թիվ",
  "Set SUPABASE_SERVICE_ROLE_KEY to store connection settings":
    "Միացման կարգավորումները պահելու համար նշեք SUPABASE_SERVICE_ROLE_KEY-ը",
};

export default admin;
