/** Armenian (account). Keys are the exact English text shown in the app. */
const account: Record<string, string> = {
  "Fundamentals, not hype": "Հիմնարար տվյալներ, ոչ թե աղմուկ",
  "Your AI buddy for portfolio and financial management.": "Ձեր AI ընկերը պորտֆելի և ֆինանսների կառավարման համար։",
  "Reach financial freedom and learn more about your current portfolio. Let your money work for you: a simple website for a simple path to wealth.":
    "Հասեք ֆինանսական ազատության և ավելին իմացեք ձեր պորտֆելի մասին։ Թող գումարն աշխատի ձեզ համար՝ պարզ կայք՝ հարստության պարզ ճանապարհի համար։",
  "No personalized information": "Առանց անձնական տվյալների",
  "User-friendly interface": "Հարմար ինտերֆեյս",
  "Transparent analytics": "Թափանցիկ վերլուծություն",
  "Private workspace": "Անձնական աշխատանքային տարածք",
  "Sign in to your book": "Մուտք գործեք ձեր հաշիվ",
  "Early access. Your data stays private to your account.": "Վաղ հասանելիություն։ Ձեր տվյալները տեսանելի են միայն ձեզ։",

  // Sign in, sign up, password reset (auth-form.tsx)
  Email: "Էլ. փոստ",
  Password: "Գաղտնաբառ",
  "Show password": "Ցույց տալ գաղտնաբառը",
  "Hide password": "Թաքցնել գաղտնաբառը",
  "Forgot password?": "Մոռացե՞լ եք գաղտնաբառը",
  "I agree to the {terms} and {privacy}, and I understand StockBuddy gives estimates and education, not financial advice.":
    "Ես համաձայն եմ «{terms}» և «{privacy}» փաստաթղթերին և հասկանում եմ, որ StockBuddy-ն տրամադրում է գնահատականներ և կրթական նյութեր, այլ ոչ թե ֆինանսական խորհրդատվություն։",
  "Please agree to the Terms and Privacy Policy to create an account.":
    "Հաշիվ ստեղծելու համար համաձայնեք Պայմաններին և Գաղտնիության քաղաքականությանը։",
  "Too many requests. Wait a minute and try again.": "Չափազանց շատ հարցումներ։ Սպասեք մեկ րոպե և նորից փորձեք։",
  "A new confirmation link was sent to {email}.": "Հաստատման նոր հղում ուղարկվեց {email} հասցեին։",
  "If an account exists for {email}, we sent a link to reset the password.":
    "Եթե {email} հասցեով հաշիվ գոյություն ունի, մենք դրան ուղարկել ենք գաղտնաբառը վերականգնելու հղում։",
  "Confirm your email first: open the link we sent to {email}.":
    "Նախ հաստատեք ձեր էլ. փոստը՝ բացեք այն հղումը, որը մենք ուղարկել ենք {email} հասցեին։",
  "Almost done. We sent a confirmation link to {email}; open it to finish creating your account.":
    "Գրեթե պատրաստ է։ Մենք հաստատման հղում ենք ուղարկել {email} հասցեին։ Բացեք այն՝ հաշվի ստեղծումն ավարտելու համար։",
  "Didn't get it? Resend the confirmation email": "Չե՞ք ստացել։ Կրկին ուղարկել հաստատման նամակը",
  "Working…": "Կատարվում է…",
  "Sign in": "Մուտք գործել",
  "Create account": "Ստեղծել հաշիվ",
  "Send reset link": "Ուղարկել վերականգնման հղումը",
  "Need an account? Sign up": "Հաշիվ չունե՞ք։ Գրանցվեք",
  "Already registered? Sign in": "Արդեն գրանցվա՞ծ եք։ Մուտք գործեք",
  "Back to sign in": "Վերադառնալ մուտքին",

  // Notices after opening an email link (login/page.tsx CONFIRM_NOTICES)
  "Your email is confirmed. Sign in to continue.": "Ձեր էլ. փոստը հաստատված է։ Շարունակելու համար մուտք գործեք։",
  "Your account and all its data were deleted. Thanks for trying StockBuddy.":
    "Ձեր հաշիվը և դրա բոլոր տվյալները ջնջվեցին։ Շնորհակալություն StockBuddy-ն փորձելու համար։",
  "That confirmation link has expired or was already used. Sign in, or create the account again to get a new link.":
    "Այդ հաստատման հղման ժամկետն անցել է, կամ այն արդեն օգտագործվել է։ Մուտք գործեք կամ նորից ստեղծեք հաշիվը՝ նոր հղում ստանալու համար։",
  "That password reset link has expired or was already used. Ask for a new one below.":
    "Գաղտնաբառի վերականգնման այդ հղման ժամկետն անցել է, կամ այն արդեն օգտագործվել է։ Ստորև խնդրեք նորը։",
  "Open the password reset link in the same browser you asked for it from, or ask for a new one below.":
    "Բացեք գաղտնաբառի վերականգնման հղումը նույն դիտարկիչում, որից այն խնդրել եք, կամ ստորև խնդրեք նորը։",

  // Supabase sign-in errors (shown as they arrive, translated when known)
  "Invalid login credentials": "Սխալ էլ. փոստ կամ գաղտնաբառ",
  "Email not confirmed": "Էլ. փոստը հաստատված չէ",
  "User already registered": "Այս էլ. փոստով օգտատեր արդեն գրանցված է",
  "Password should be at least 6 characters.": "Գաղտնաբառը պետք է լինի առնվազն 6 նիշ։",
  "Password should be at least 8 characters.": "Գաղտնաբառը պետք է լինի առնվազն 8 նիշ։",
  "Email rate limit exceeded": "Նամակների սահմանաչափը գերազանցվել է։ Փորձեք մի փոքր ուշ։",
  "email rate limit exceeded": "Նամակների սահմանաչափը գերազանցվել է։ Փորձեք մի փոքր ուշ։",
  "Unable to validate email address: invalid format": "Չհաջողվեց ստուգել էլ. փոստի հասցեն․ սխալ ձևաչափ",
  "Signup requires a valid password": "Գրանցվելու համար անհրաժեշտ է վավեր գաղտնաբառ",
  "Signups not allowed for this instance": "Գրանցումն այս պահին հասանելի չէ",
  "Token has expired or is invalid": "Հղման ժամկետն անցել է, կամ այն անվավեր է",
  "Auth session missing!": "Մուտքի սեսիան չի գտնվել։ Կրկին բացեք վերականգնման հղումը։",
  "New password should be different from the old password.": "Նոր գաղտնաբառը պետք է տարբերվի հինից։",
  "Failed to fetch": "Չհաջողվեց կապ հաստատել սերվերի հետ",

  // New password after a reset link (new-password-form.tsx, reset-password/page.tsx)
  "New password": "Նոր գաղտնաբառ",
  "Show passwords": "Ցույց տալ գաղտնաբառերը",
  "Hide passwords": "Թաքցնել գաղտնաբառերը",
  "Repeat new password": "Կրկնեք նոր գաղտնաբառը",
  "Use at least 8 characters.": "Օգտագործեք առնվազն 8 նիշ։",
  "The two passwords don't match.": "Գաղտնաբառերը չեն համընկնում։",
  "Saving…": "Պահպանվում է…",
  "Save new password": "Պահպանել նոր գաղտնաբառը",
  "Choose a new password": "Ընտրեք նոր գաղտնաբառ",
  "Use at least 8 characters. You stay signed in afterwards.":
    "Օգտագործեք առնվազն 8 նիշ։ Դրանից հետո դուք կմնաք համակարգում։",

  // Profile, share links, delete account (profile-dialog.tsx)
  Close: "Փակել",
  "Shown on pages you share": "Ցուցադրվում է ձեր կիսված էջերում",
  "Date of birth": "Ծննդյան ամսաթիվ",
  "You are {age}. Your age is calculated from this date and updates on its own.":
    "Դուք {age} տարեկան եք։ Ձեր տարիքը հաշվարկվում է այս ամսաթվից և թարմացվում է ինքնաշխատ։",
  "Used to show your current age and the age you reach FIRE. Leave it blank to hide ages.":
    "Օգտագործվում է ձեր ներկայիս տարիքը և FIRE-ին հասնելու տարիքը ցույց տալու համար։ Թողեք դատարկ՝ տարիքները թաքցնելու համար։",
  "Enter a date of birth between 1900 and today.": "Մուտքագրեք ծննդյան ամսաթիվ 1900 թվականից մինչև այսօր։",
  "Use a name of 80 characters or fewer.": "Անունը պետք է լինի առավելագույնը 80 նիշ։",
  "Could not save your profile": "Չհաջողվեց պահպանել ձեր պրոֆիլը",
  "Save profile": "Պահպանել պրոֆիլը",
  "Shareable links": "Կիսվելու հղումներ",
  "Anyone with a link sees a read-only page with all the data, without signing in. Your email and date of birth are never shown. Turn a link off to stop it working.":
    "Հղում ունեցող ցանկացած մարդ առանց մուտք գործելու կտեսնի միայն դիտման համար նախատեսված էջ՝ բոլոր տվյալներով։ Ձեր էլ. փոստը և ծննդյան ամսաթիվը երբեք չեն ցուցադրվում։ Անջատեք հղումը, որպեսզի այն դադարի աշխատել։",
  "Loading links…": "Հղումները բեռնվում են…",
  "Could not load your links": "Չհաջողվեց բեռնել ձեր հղումները",
  "FIRE plan": "FIRE պլան",
  "Portfolio: {name}": "Պորտֆել՝ {name}",
  "{label} link": "Հղում՝ {label}",
  Copied: "Պատճենված է",
  "Copy {label} link": "Պատճենել հղումը՝ {label}",
  "Copy link": "Պատճենել հղումը",
  "Could not create the link": "Չհաջողվեց ստեղծել հղումը",
  "Could not turn the link off": "Չհաջողվեց անջատել հղումը",
  "Copy didn't work here. Select the link and copy it by hand.":
    "Այստեղ պատճենումը չաշխատեց։ Ընտրեք հղումը և պատճենեք այն ձեռքով։",
  "Delete my account and data": "Ջնջել իմ հաշիվը և տվյալները",
  "The admin account can't be deleted here.": "Ադմինի հաշիվը հնարավոր չէ ջնջել այստեղ։",
  "Permanently removes your account and everything in it: portfolios, FIRE plan, assets, wishlist, reviews, and share links.":
    "Ընդմիշտ ջնջում է ձեր հաշիվը և դրա ամբողջ բովանդակությունը՝ պորտֆելները, FIRE պլանը, ակտիվները, ցանկությունների ցուցակը, վերանայումները և կիսվելու հղումները։",
  "Delete my account…": "Ջնջել իմ հաշիվը…",
  "This can't be undone.": "Այս գործողությունը հնարավոր չէ հետարկել։",
  "All your data is deleted right away and shared links stop working.":
    "Ձեր բոլոր տվյալներն անմիջապես կջնջվեն, և կիսված հղումները կդադարեն աշխատել։",
  "Type {word} to confirm": "Մուտքագրեք {word}՝ հաստատելու համար",
  "Could not delete the account": "Չհաջողվեց ջնջել հաշիվը",
  "Keep my account": "Պահել իմ հաշիվը",
  "Deleting…": "Ջնջվում է…",
  "Delete my account": "Ջնջել իմ հաշիվը",

  // Legal pages (legal-page.tsx, privacy/page.tsx, terms/page.tsx)
  "Last updated {date}. StockBuddy is in early access (beta).":
    "Վերջին թարմացումը՝ {date}։ StockBuddy-ն վաղ հասանելիության (բետա) փուլում է։",
  "October 26, 2026": "2026 թ. հոկտեմբերի 26",
  "Questions? Write to {email}.": "Հարցեր ունե՞ք։ Գրեք {email} հասցեին։",
  "Privacy Policy · StockBuddy": "Գաղտնիության քաղաքականություն · StockBuddy",
  "Terms · StockBuddy": "Պայմաններ · StockBuddy",
  "Terms of Use": "Օգտագործման պայմաններ",
  "What we collect": "Ինչ ենք մենք հավաքում",
  "Account:": "Հաշիվ․",
  "your email address and a password (stored only as a secure hash by our authentication provider), and when you accepted these terms.":
    "ձեր էլ. փոստի հասցեն և գաղտնաբառը (որը մեր նույնականացման մատակարարը պահում է միայն որպես անվտանգ հեշ), ինչպես նաև այն պահը, երբ դուք ընդունել եք այս պայմանները։",
  "What you enter:": "Այն, ինչ դուք մուտքագրում եք․",
  "your date of birth (if you add it), incomes, expenses, savings, bonds, assets and their locations, portfolio holdings and transactions, report reminders, and wishlist items.":
    "ձեր ծննդյան ամսաթիվը (եթե այն ավելացնեք), եկամուտները, ծախսերը, խնայողությունները, պարտատոմսերը, ակտիվները և դրանց գտնվելու վայրերը, պորտֆելի դիրքերը և գործարքները, հաշվետվությունների հիշեցումները և ցանկությունների ցուցակի տարրերը։",
  "Technical data:": "Տեխնիկական տվյալներ․",
  "basic logs our servers keep to run and secure the service, such as request times and errors.":
    "հիմնական գրանցամատյաններ, որոնք մեր սերվերները պահում են ծառայության աշխատանքն ու անվտանգությունն ապահովելու համար, օրինակ՝ հարցումների ժամերը և սխալները։",
  "How we use it": "Ինչպես ենք դրանք օգտագործում",
  "Only to run StockBuddy for you: show your FIRE plan, portfolio, and analytics, send the reminder emails you ask for, and keep the service secure. We do not sell your data, show ads, or share it for marketing.":
    "Միայն StockBuddy-ն ձեզ համար գործարկելու նպատակով՝ ցույց տալու ձեր FIRE պլանը, պորտֆելը և վերլուծությունը, ուղարկելու ձեր խնդրած հիշեցման նամակները և ապահովելու ծառայության անվտանգությունը։ Մենք չենք վաճառում ձեր տվյալները, չենք ցուցադրում գովազդ և չենք տրամադրում դրանք մարքեթինգային նպատակներով։",
  "Who else processes it": "Ով է ևս մշակում դրանք",
  "hosts our database, sign-in, and file storage.":
    "հյուրընկալում է մեր տվյալների բազան, մուտքի համակարգը և ֆայլերի պահոցը։",
  "receives the text of your 300-wishes list when we check a new wish for repeats.":
    "ստանում է ձեր 300 ցանկությունների ցուցակի տեքստը, երբ մենք նոր ցանկությունը ստուգում ենք կրկնությունների համար։",
  "receives a portfolio screenshot when you choose to import one.":
    "ստանում է պորտֆելի սքրինշոթը, երբ դուք որոշում եք այն ներմուծել։",
  "Market data sources": "Շուկայական տվյալների աղբյուրները",
  "(the SEC and Yahoo Finance) receive only ticker symbols to look up public prices and company data, never anything about you.":
    "(SEC-ը և Yahoo Finance-ը) ստանում են միայն տիկերները՝ հրապարակային գներն ու ընկերությունների տվյալները գտնելու համար, և երբեք որևէ տեղեկություն ձեր մասին։",
  "Our email provider": "Մեր էլ. փոստի մատակարարը",
  "sends account and reminder emails to your address.": "ուղարկում է հաշվի և հիշեցման նամակներ ձեր հասցեին։",
  "These providers act on our instructions and may process data outside your country.":
    "Այս մատակարարները գործում են մեր հրահանգներով և կարող են մշակել տվյալները ձեր երկրից դուրս։",
  "Who can see your data": "Ով կարող է տեսնել ձեր տվյալները",
  "Your financial entries are private to your account; other users can never see them. Our administrators manage shared content such as Education articles and do not browse individual accounts except to fix a problem you report or when the law requires it.":
    "Ձեր ֆինանսական գրառումները տեսանելի են միայն ձեր հաշվում, և այլ օգտատերերը երբեք չեն կարող դրանք տեսնել։ Մեր ադմինիստրատորները կառավարում են ընդհանուր բովանդակությունը, օրինակ՝ Կրթություն բաժնի հոդվածները, և չեն դիտում առանձին հաշիվներ, բացառությամբ այն դեպքերի, երբ անհրաժեշտ է շտկել ձեր հայտնած խնդիրը, կամ երբ դա պահանջում է օրենքը։",
  "How long we keep it, and your choices": "Որքան ժամանակ ենք պահում դրանք, և ձեր ընտրությունները",
  "We keep your data while your account is open. You can edit or delete any entry at any time. To delete your whole account, or to get a copy of your data, email {email} from your account's address and we will do it within 30 days. Backups that contain deleted data expire on their own schedule.":
    "Մենք պահում ենք ձեր տվյալները, քանի դեռ ձեր հաշիվը բաց է։ Դուք կարող եք ցանկացած պահի խմբագրել կամ ջնջել ցանկացած գրառում։ Ձեր ամբողջ հաշիվը ջնջելու կամ ձեր տվյալների պատճենը ստանալու համար ձեր հաշվի հասցեից նամակ գրեք {email} հասցեին, և մենք դա կանենք 30 օրվա ընթացքում։ Ջնջված տվյալներ պարունակող պահուստային պատճենները ջնջվում են իրենց սեփական ժամանակացույցով։",
  Security: "Անվտանգություն",
  "Data travels encrypted, every account's records are isolated at the database level, and service keys are stored encrypted. No system is perfectly secure; if we learn of a breach that affects you, we will tell you.":
    "Տվյալները փոխանցվում են գաղտնագրված, յուրաքանչյուր հաշվի գրառումները մեկուսացված են տվյալների բազայի մակարդակում, իսկ ծառայության բանալիները պահվում են գաղտնագրված։ Ոչ մի համակարգ կատարելապես անվտանգ չէ։ Եթե մենք իմանանք ձեզ առնչվող տվյալների արտահոսքի մասին, կտեղեկացնենք ձեզ։",
  Children: "Երեխաներ",
  "StockBuddy is not meant for anyone under 18.": "StockBuddy-ն նախատեսված չէ 18 տարեկանից ցածր անձանց համար։",
  Changes: "Փոփոխություններ",
  "If we change this policy in a meaningful way, we will tell you by email or in the app before the change applies.":
    "Եթե մենք էականորեն փոխենք այս քաղաքականությունը, փոփոխության ուժի մեջ մտնելուց առաջ կտեղեկացնենք ձեզ էլ. փոստով կամ հավելվածում։",
  "Early access": "Վաղ հասանելիություն",
  "StockBuddy is in early access. Features may change, break, or be removed, and the service may be unavailable at times. Your feedback helps us fix that.":
    "StockBuddy-ն վաղ հասանելիության փուլում է։ Գործառույթները կարող են փոխվել, խափանվել կամ հեռացվել, և ծառայությունը երբեմն կարող է անհասանելի լինել։ Ձեր կարծիքն օգնում է մեզ շտկել դա։",
  "Not financial advice": "Ֆինանսական խորհրդատվություն չէ",
  "StockBuddy gives estimates, education, and organizing tools. It is not a financial, investment, tax, or legal adviser, and nothing in it is a recommendation to buy, sell, or hold anything. Projections, FIRE dates, AI reviews, and market data can be wrong or out of date. Make your own decisions, and talk to a licensed professional before acting on anything important.":
    "StockBuddy-ն տրամադրում է գնահատականներ, կրթական նյութեր և կազմակերպման գործիքներ։ Այն ֆինանսական, ներդրումային, հարկային կամ իրավական խորհրդատու չէ, և դրանում ոչինչ որևէ բան գնելու, վաճառելու կամ պահելու առաջարկություն չէ։ Կանխատեսումները, FIRE ամսաթվերը, AI վերանայումները և շուկայական տվյալները կարող են սխալ կամ հնացած լինել։ Ինքներդ կայացրեք ձեր որոշումները և որևէ կարևոր քայլ անելուց առաջ խորհրդակցեք լիցենզավորված մասնագետի հետ։",
  "Your account": "Ձեր հաշիվը",
  "You must be at least 18 and give a real email address you control.":
    "Դուք պետք է լինեք առնվազն 18 տարեկան և նշեք իրական էլ. փոստի հասցե, որը կառավարում եք դուք։",
  "Keep your password private; you are responsible for activity in your account.":
    "Գաղտնի պահեք ձեր գաղտնաբառը։ Դուք պատասխանատու եք ձեր հաշվում կատարվող գործողությունների համար։",
  "You own the data you enter. You let us store and process it only to run the service.":
    "Ձեր մուտքագրած տվյալները պատկանում են ձեզ։ Դուք թույլ եք տալիս մեզ պահել և մշակել դրանք միայն ծառայությունը գործարկելու համար։",
  "Fair use": "Արդար օգտագործում",
  "Don't try to access other people's data, break or overload the service, or scrape it.":
    "Մի՛ փորձեք մուտք գործել այլ մարդկանց տվյալներ, խափանել կամ գերծանրաբեռնել ծառայությունը կամ ավտոմատ կերպով քաղել դրա տվյալները։",
  "AI features have daily limits per account so the service stays available and affordable for everyone.":
    "AI գործառույթներն ունեն օրական սահմանաչափեր յուրաքանչյուր հաշվի համար, որպեսզի ծառայությունը մնա հասանելի և մատչելի բոլորի համար։",
  "We may suspend accounts that break these terms or put other users at risk.":
    "Մենք կարող ենք կասեցնել այն հաշիվները, որոնք խախտում են այս պայմանները կամ վտանգի տակ են դնում այլ օգտատերերի։",
  "Third-party data": "Երրորդ կողմի տվյալներ",
  "Prices and company data come from public sources such as the SEC and Yahoo Finance and are provided as they are, without guarantee of accuracy or timeliness.":
    "Գներն ու ընկերությունների տվյալները ստացվում են հրապարակային աղբյուրներից, օրինակ՝ SEC-ից և Yahoo Finance-ից, և տրամադրվում են այնպես, ինչպես կան, առանց ճշգրտության կամ արդիականության երաշխիքի։",
  Liability: "Պատասխանատվություն",
  "The service is provided “as is” during early access. To the extent the law allows, we are not liable for investment losses or for indirect damages from using it.":
    "Վաղ հասանելիության ընթացքում ծառայությունը տրամադրվում է «ինչպես կա» սկզբունքով։ Օրենքով թույլատրելի չափով մենք պատասխանատվություն չենք կրում ներդրումային վնասների կամ դրա օգտագործումից առաջացած անուղղակի վնասների համար։",
  "Ending your use": "Օգտագործման դադարեցում",
  "You can stop using StockBuddy at any time and ask us to delete your account (see the {privacy}). We may end the early-access program, and we will give you notice and a chance to get a copy of your data first.":
    "Դուք կարող եք ցանկացած պահի դադարեցնել StockBuddy-ի օգտագործումը և խնդրել մեզ ջնջել ձեր հաշիվը (տե՛ս {privacy})։ Մենք կարող ենք ավարտել վաղ հասանելիության ծրագիրը, սակայն նախապես կտեղեկացնենք ձեզ և հնարավորություն կտանք ստանալու ձեր տվյալների պատճենը։",
  "We will tell you about meaningful changes to these terms before they apply. Questions: {email}.":
    "Այս պայմանների էական փոփոխությունների մասին մենք կտեղեկացնենք ձեզ մինչև դրանց ուժի մեջ մտնելը։ Հարցերի համար՝ {email}։",

  // Public read-only share pages (share/[token]/page.tsx, shared-fire.tsx, shared-portfolio.tsx)
  "Shared from StockBuddy": "Կիսված է StockBuddy-ից",
  "Loading…": "Բեռնվում է…",
  "This link isn't active": "Այս հղումն ակտիվ չէ",
  "The owner may have turned it off. Ask them for a new link.":
    "Հնարավոր է՝ սեփականատերն այն անջատել է։ Խնդրեք նրանից նոր հղում։",
  "{owner}'s FIRE plan": "{owner} · FIRE պլան",
  "A FIRE plan": "FIRE պլան",
  "{owner}'s portfolio: {name}": "{owner} · պորտֆել՝ {name}",
  "{owner}'s portfolio": "{owner} · պորտֆել",
  "A portfolio: {name}": "Պորտֆել՝ {name}",
  "A portfolio": "Պորտֆել",
  "Read-only view shared from StockBuddy · prices as of {date} UTC. Estimates, not advice.":
    "Միայն դիտման համար՝ կիսված StockBuddy-ից · գները՝ {date} UTC դրությամբ։ Գնահատականներ են, ոչ թե խորհրդատվություն։",
  "This portfolio is no longer available.": "Այս պորտֆելն այլևս հասանելի չէ։",
  "FIRE summary": "FIRE ամփոփում",
  "Monthly income": "Ամսական եկամուտ",
  "Monthly expenses": "Ամսական ծախսեր",
  "Current assets": "Ընթացիկ ակտիվներ",
  "Portfolio + savings": "Պորտֆել + խնայողություններ",
  "Time to FIRE": "Մինչև FIRE",
  "Around {date}": "Մոտավորապես {date}",
  "{percent}% funded": "{percent}% ֆինանսավորված",
  "50+ years": "50+ տարի",
  Reached: "Ձեռք է բերված",
  "{months} mo": "{months} ամիս",
  "{years} yr": "{years} տարի",
  "{years} yrs": "{years} տարի",
  "{years} yr {months} mo": "{years} տարի {months} ամիս",
  "{years} yrs {months} mo": "{years} տարի {months} ամիս",
  "Path to FIRE": "Ճանապարհ դեպի FIRE",
  "Assets · {count}": "Ակտիվներ · {count}",
  "Incomes · {total}/mo": "Եկամուտներ · {total}/ամիս",
  "Expenses · {total}/mo": "Ծախսեր · {total}/ամիս",
  "None yet.": "Դեռ ոչինչ չկա։",
  "until {date}": "մինչև {date}",
  "Portfolio summary": "Պորտֆելի ամփոփում",
  "Total value": "Ընդհանուր արժեք",
  Holdings: "Դիրքեր",
  "Unrealized gain": "Չիրացված շահույթ",
  "Holdings · {count}": "Դիրքեր · {count}",
  Holding: "Դիրք",
  Shares: "Բաժնետոմսեր",
  Price: "Գին",
  Value: "Արժեք",
  Weight: "Կշիռ",
  Gain: "Շահույթ",
};

export default account;
