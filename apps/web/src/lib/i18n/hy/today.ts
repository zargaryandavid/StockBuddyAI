/** Today page, net worth chart, setup guide and broker file import. */
const today: Record<string, string> = {
  Today: "Այսօր",
  "Your money at a glance, and what needs a look.": "Ձեր գումարները մեկ հայացքով, և այն, ինչին պետք է ուշադրություն դարձնել։",
  "Set up StockBuddy in three steps": "Կարգավորեք StockBuddy-ն երեք քայլով",
  "{done} of 3 done": "Արված է {done}-ը 3-ից",
  "Skip for now": "Բաց թողնել առայժմ",
  Done: "Արված է",
  "Add your income and expenses": "Ավելացրեք ձեր եկամուտներն ու ծախսերը",
  "Your salary, rent and bills. FIRE uses them to work out how much you save and when you could stop working.":
    "Աշխատավարձ, վարձ և հաշիվներ։ FIRE-ը դրանցով հաշվում է, թե որքան եք խնայում և երբ կարող եք դադարել աշխատել։",
  "Open FIRE": "Բացել FIRE-ը",
  "Add your portfolio": "Ավելացրեք ձեր պորտֆելը",
  "Type your holdings, upload a broker file (CSV), or a screenshot of your broker app.":
    "Մուտքագրեք ձեր դիրքերը, վերբեռնեք բրոքերի ֆայլը (CSV) կամ բրոքերի հավելվածի սքրինշոթը։",
  "Open Portfolio": "Բացել պորտֆելը",
  "Add savings and other assets": "Ավելացրեք խնայողություններ և այլ ակտիվներ",
  "Savings accounts, CDs, bonds, a home or a car, so your net worth is complete.":
    "Խնայողական հաշիվներ, ավանդներ, պարտատոմսեր, տուն կամ մեքենա, որպեսզի ձեր զուտ կարողությունն ամբողջական լինի։",
  "Open Assets": "Բացել ակտիվները",
  "Net worth": "Զուտ կարողություն",
  "Markets today: {amount}": "Շուկաներն այսօր՝ {amount}",
  "{amount} since {day}": "{amount} {day}-ից ի վեր",
  "Investments {investments} · Savings {savings} · Other {other}":
    "Ներդրումներ {investments} · Խնայողություններ {savings} · Այլ {other}",
  "FIRE progress": "FIRE առաջընթաց",
  "{assets} of {target} · {years}": "{assets}՝ {target}-ից · {years}",
  "Add your expenses to see your FIRE number.": "Ավելացրեք ձեր ծախսերը՝ FIRE թիվը տեսնելու համար։",
  "No portfolio yet": "Պորտֆել դեռ չկա",
  "{amount} below your cash target": "{amount}-ով պակաս ձեր կանխիկի թիրախից",
  "At or above your cash target": "Կանխիկի թիրախին հասած է",
  "Net worth over time": "Զուտ կարողությունը ժամանակի ընթացքում",
  "Needs a look": "Ուշադրության կարիք ունի",
  "Checking your limits…": "Ստուգում ենք ձեր սահմանաչափերը…",
  "Everything is within your limits.": "Ամեն ինչ ձեր սահմանաչափերի մեջ է։",
  "Add a portfolio to check its limits.": "Ավելացրեք պորտֆել՝ դրա սահմանաչափերը ստուգելու համար։",
  "{weight} of {portfolio}, above your {limit} limit by about {amount}":
    "{portfolio}-ի {weight}-ը, ձեր {limit} սահմանաչափից մոտ {amount}-ով ավելի",
  "{share} of {portfolio}; target {target}, {amount} to add":
    "{portfolio}-ի {share}-ը. թիրախ՝ {target}, պակասում է {amount}",
  "No price for {tickers}; they are left out of these numbers.":
    "{tickers}-ի գինը հասանելի չէ. դրանք ներառված չեն այս թվերում։",
  "Reports coming up": "Սպասվող հաշվետվություններ",
  "No company reports expected in the next 30 days.": "Առաջիկա 30 օրում ընկերությունների հաշվետվություններ չեն սպասվում։",
  "Expected any day now (last report {last})": "Սպասվում է մոտ օրերս (վերջին հաշվետվությունը՝ {last})",
  "Expected around {day} (last report {last})": "Սպասվում է մոտ {day}-ին (վերջին հաշվետվությունը՝ {last})",
  "Estimated as about three months after each company's last report.":
    "Գնահատված է յուրաքանչյուր ընկերության վերջին հաշվետվությունից մոտ երեք ամիս հետո։",
  "Your chart starts today. Each day you open StockBuddy adds a point, so come back tomorrow to see the line grow.":
    "Ձեր գրաֆիկը սկսվում է այսօր։ Ամեն օր, երբ բացում եք StockBuddy-ն, ավելանում է մեկ կետ. վաղը կտեսնեք, թե ինչպես է գիծն աճում։",
  "Your chart starts the first day your net worth is saved. Add a portfolio or your savings to begin.":
    "Գրաֆիկը կսկսվի այն օրը, երբ առաջին անգամ պահպանվի ձեր զուտ կարողությունը։ Սկսելու համար ավելացրեք պորտֆել կամ խնայողություններ։",
  "{amount} in this period": "{amount} այս ժամանակահատվածում",
  "Chart range": "Գրաֆիկի միջակայք",
  All: "Բոլորը",
  "Net worth from {from} ({start}) to {to} ({end})": "Զուտ կարողությունը {from}-ից ({start}) մինչև {to} ({end})",
  "Choose a CSV file": "Ընտրեք CSV ֆայլ",
  "A positions export from Fidelity, Schwab, Vanguard, E*TRADE, Interactive Brokers and others, or any file with ticker and shares columns.":
    "Դիրքերի արտահանում Fidelity-ից, Schwab-ից, Vanguard-ից, E*TRADE-ից, Interactive Brokers-ից և այլն, կամ ցանկացած ֆայլ՝ տիկերի և բաժնետոմսերի սյունակներով։",
  "{ticker}: {shares} shares rounded down to {whole}; StockBuddy keeps whole shares.":
    "{ticker}՝ {shares} բաժնետոմսը կլորացվել է մինչև {whole}. StockBuddy-ն պահում է միայն ամբողջ բաժնետոմսեր։",
  "Line {line}: {reason}": "Տող {line}՝ {reason}",
  "Read as a {broker} export. Confirm the preview before importing.":
    "Կարդացվել է որպես {broker}-ի արտահանում։ Ներմուծելուց առաջ հաստատեք նախադիտումը։",
  "The file also lists {amount} in cash; set Cash above if you want it included.":
    "Ֆայլում նաև նշված է {amount} կանխիկ. եթե ուզում եք ներառել, լրացրեք «Կանխիկ» դաշտը վերևում։",
  "No header row with a symbol and a quantity column was found":
    "Չգտնվեց վերնագրի տող՝ տիկերի և քանակի սյունակներով",
  "Options are not supported": "Օպցիոնները չեն աջակցվում",
  "Not a valid ticker symbol": "Անվավեր տիկեր",
  "Missing share quantity": "Բաժնետոմսերի քանակը նշված չէ",
  "Short or zero positions are skipped": "Կարճ կամ զրոյական դիրքերը բաց են թողնվում",
  "Not a stock or fund position": "Բաժնետոմսի կամ ֆոնդի դիրք չէ",
};

export default today;
