/** Armenian (analysis). Keys are the exact English text shown in the app. */
const analysis: Record<string, string> = {
  // Ask Buddy: page, pickers, queue
  "Ask Buddy": "Հարցրեք Buddy-ին",
  Portfolios: "Պորտֆելներ",
  "All ({count})": "Բոլորը ({count})",
  "{count} of {total}": "{count}-ը {total}-ից",
  "All portfolios": "Բոլոր պորտֆելները",
  Holdings: "Դիրքեր",
  "Select all holdings": "Ընտրել բոլոր դիրքերը",
  Ticker: "Տիկեր",
  Company: "Ընկերություն",
  Portfolio: "Պորտֆել",
  "Review {ticker} in {portfolio}": "Վերանայել {ticker}-ը «{portfolio}» պորտֆելում",
  "Can't review yet: {reason}": "Դեռ հնարավոր չէ վերանայել. {reason}",
  "Pick at least one portfolio.": "Ընտրեք առնվազն մեկ պորտֆել։",
  "Add holdings to a portfolio first.": "Նախ դիրքեր ավելացրեք պորտֆելում։",
  "As-of close": "Փակման ամսաթիվ",
  "Run {count} review": "Սկսել {count} վերանայում",
  "Run {count} reviews": "Սկսել {count} վերանայում",
  "{count} holding can't be reviewed yet and is left out:":
    "{count} դիրք դեռ հնարավոր չէ վերանայել, և այն բաց է թողնված․",
  "{count} holdings can't be reviewed yet and are left out:":
    "{count} դիրք դեռ հնարավոր չէ վերանայել, և դրանք բաց են թողնված․",
  "{tickers}. Buddy needs 4 quarters of company financials filed with the SEC; ETFs, funds, and new listings don't have them yet.":
    "{tickers}։ Buddy-ին անհրաժեշտ են SEC-ին ներկայացված ընկերության 4 եռամսյակի ֆինանսական հաշվետվություններ․ ETF-ները, ֆոնդերը և նոր ցուցակված ընկերությունները դրանք դեռ չունեն։",
  "Uses the close of {date}. Prices are final through {latest}; today's close is used once the day is over.":
    "Օգտագործվում է {date}-ի փակման գինը։ Գները վերջնական են մինչև {latest}․ այսօրվա փակման գինը կօգտագործվի օրվա ավարտից հետո։",
  "Review progress": "Վերանայման ընթացքը",
  Finished: "Ավարտված է",
  Stopped: "Կանգնեցված է",
  Paused: "Դադարեցված է",
  "Stopping after this review…": "Կանգ կառնի այս վերանայումից հետո…",
  "Reviewing {ticker}": "Վերանայվում է {ticker}-ը",
  "Starting…": "Սկսվում է…",
  "{count} failed": "{count}-ը ձախողվել է",
  "{count} not started (no tokens used)": "{count}-ը չի սկսվել (թոքեններ չեն ծախսվել)",
  Resume: "Շարունակել",
  Pause: "Դադար",
  Stop: "Կանգնեցնել",
  "Reviews done": "Ավարտված վերանայումներ",
  "Pause or Stop takes effect after the review in progress. Holdings not started use no tokens.":
    "Դադարը կամ կանգառը կգործի ընթացիկ վերանայումից հետո։ Չսկսված դիրքերի համար թոքեններ չեն ծախսվում։",

  // Ask Buddy: statuses
  "Can't review yet": "Դեռ հնարավոր չէ վերանայել",
  "Not started": "Չի սկսվել",
  "Reviewing…": "Վերանայվում է…",
  Waiting: "Սպասում է",
  Failed: "Ձախողվել է",
  "Not enough data": "Բավարար տվյալներ չկան",
  Done: "Պատրաստ է",
  Sell: "Վաճառել",
  Hold: "Պահել",
  Add: "Ավելացնել",
  Trim: "Կրճատել",

  // Ask Buddy: tokens
  "Your tokens": "Ձեր թոքենները",
  "You've used this month's {count} free token.": "Դուք օգտագործել եք այս ամսվա {count} անվճար թոքենը։",
  "You've used this month's {count} free tokens.": "Դուք օգտագործել եք այս ամսվա {count} անվճար թոքենները։",
  "They come back on {date}, or you can buy more tokens.":
    "Դրանք կվերականգնվեն {date}-ին, կամ կարող եք լրացուցիչ թոքեններ գնել։",
  "This run needs {count} token, but you have {left} left.":
    "Այս գործարկման համար պետք է {count} թոքեն, բայց ձեզ մնացել է {left}։",
  "This run needs {count} tokens, but you have {left} left.":
    "Այս գործարկման համար պետք է {count} թոքեն, բայց ձեզ մնացել է {left}։",
  "The first {left} will run and the rest won't start. Untick {count} holding to choose which, or buy more tokens.":
    "Կկատարվեն առաջին {left}-ը, իսկ մնացածը չեն սկսվի։ Հանեք {count} դիրքի նշումը՝ ընտրելու համար, թե որոնք, կամ գնեք լրացուցիչ թոքեններ։",
  "The first {left} will run and the rest won't start. Untick {count} holdings to choose which, or buy more tokens.":
    "Կկատարվեն առաջին {left}-ը, իսկ մնացածը չեն սկսվի։ Հանեք {count} դիրքի նշումը՝ ընտրելու համար, թե որոնք, կամ գնեք լրացուցիչ թոքեններ։",
  "This month's free tokens": "Այս ամսվա անվճար թոքենները",
  "Free during early access": "Անվճար՝ վաղ հասանելիության ընթացքում",
  "{left} of {limit} left": "Մնացել է {left}-ը {limit}-ից",
  "{used} used · resets on {date}": "օգտագործված՝ {used} · կվերականգնվի {date}-ին",
  "Tokens used this month": "Այս ամիս օգտագործված թոքենները",
  "{count} token a day": "Օրական {count} թոքեն",
  "{count} tokens a day": "Օրական {count} թոքեն",
  "Loading…": "Բեռնվում է…",
  "1 token = 1 holding review. This run: {count} token, {after} left after.":
    "1 թոքեն = 1 դիրքի վերանայում։ Այս գործարկումը՝ {count} թոքեն, որից հետո կմնա {after}։",
  "1 token = 1 holding review. This run: {count} tokens, {after} left after.":
    "1 թոքեն = 1 դիրքի վերանայում։ Այս գործարկումը՝ {count} թոքեն, որից հետո կմնա {after}։",
  "1 token = 1 holding review. This run: {count} token.":
    "1 թոքեն = 1 դիրքի վերանայում։ Այս գործարկումը՝ {count} թոքեն։",
  "1 token = 1 holding review. This run: {count} tokens.":
    "1 թոքեն = 1 դիրքի վերանայում։ Այս գործարկումը՝ {count} թոքեն։",
  "Buy tokens": "Գնել թոքեններ",
  Close: "Փակել",
  "Tokens pay for AI reviews: 1 token reviews 1 holding with all five personas. Bought tokens don't expire and are used after your free monthly ones.":
    "Թոքեններով վճարվում են AI վերանայումները․ 1 թոքենը վերանայում է 1 դիրք բոլոր հինգ կերպարներով։ Գնված թոքենները չեն սպառվում ժամկետով և օգտագործվում են ձեր ամսական անվճար թոքեններից հետո։",
  "{count} tokens": "{count} թոքեն",
  "A few extra reviews": "Մի քանի լրացուցիչ վերանայում",
  "Review every holding weekly": "Վերանայեք բոլոր դիրքերը ամեն շաբաթ",
  "For several portfolios": "Մի քանի պորտֆելի համար",
  "Coming soon": "Շուտով",
  "Buying isn't open yet. During early access you get free tokens every month.":
    "Գնումը դեռ հասանելի չէ։ Վաղ հասանելիության ընթացքում դուք ամեն ամիս ստանում եք անվճար թոքեններ։",
  "Buying isn't open yet. During early access you get {count} free token every month.":
    "Գնումը դեռ հասանելի չէ։ Վաղ հասանելիության ընթացքում դուք ամեն ամիս ստանում եք {count} անվճար թոքեն։",
  "Buying isn't open yet. During early access you get {count} free tokens every month.":
    "Գնումը դեռ հասանելի չէ։ Վաղ հասանելիության ընթացքում դուք ամեն ամիս ստանում եք {count} անվճար թոքեն։",

  // Analytics: page and performance
  "Loading analytics": "Վերլուծությունը բեռնվում է",
  "Add holdings to see portfolio analytics": "Ավելացրեք դիրքեր՝ պորտֆելի վերլուծությունը տեսնելու համար",
  "Analytics will use your saved quantities, cost basis, cash, and current market prices.":
    "Վերլուծությունը կօգտագործի ձեր պահպանված քանակները, ձեռքբերման արժեքը, կանխիկը և ընթացիկ շուկայական գները։",
  "Portfolio analytics": "Պորտֆելի վերլուծություն",
  Analytics: "Վերլուծություն",
  "Jump to section": "Անցնել բաժնին",
  Allocation: "Բաշխում",
  "Gains / Losses": "Շահույթ / վնաս",
  "Risk analysis": "Ռիսկի վերլուծություն",
  Performance: "Արդյունավետություն",
  "Portfolio vs. {benchmark}": "Պորտֆելն ընդդեմ {benchmark}-ի",
  "Analytics controls": "Վերլուծության կարգավորումներ",
  Benchmark: "Համեմատական ցուցանիշ",
  "Total US Market": "ԱՄՆ ամբողջ շուկա",
  "Custom benchmark": "Այլ համեմատական ցուցանիշ",
  "Custom ticker": "Այլ տիկեր",
  "e.g. VT": "օր.՝ VT",
  "Prices as of {date}": "Գները՝ {date} դրությամբ",
  "Prices as of unavailable": "Գների ամսաթիվը հասանելի չէ",
  Refreshing: "Թարմացվում է",
  Refresh: "Թարմացնել",
  "Performance chart mode": "Արդյունավետության գծապատկերի ռեժիմ",
  "Date range": "Ժամանակահատված",
  All: "Բոլորը",
  "Portfolio value": "Պորտֆելի արժեք",
  "Percentage return": "Տոկոսային եկամտաբերություն",
  "Portfolio vs. benchmark": "Պորտֆելն ընդդեմ համեմատական ցուցանիշի",
  "Loading price history…": "Գների պատմությունը բեռնվում է…",
  "Price history unavailable": "Գների պատմությունը հասանելի չէ",
  "Price history is unavailable": "Գների պատմությունը հասանելի չէ",
  "No {range} price history was found for {benchmark} and your holdings.":
    "{benchmark}-ի և ձեր դիրքերի համար {range} ժամանակահատվածի գների պատմություն չի գտնվել։",
  "Current holdings": "Ընթացիկ դիրքեր",
  "Holdings minus {benchmark}": "Դիրքերը՝ հանած {benchmark}",
  "{mode} from {start} to {end}": "{mode}՝ {start}-ից {end}",

  // Analytics: notices and summary
  "Could not refresh analytics.": "Չհաջողվեց թարմացնել վերլուծությունը։",
  "Prices could not refresh. Existing analytics remain available.":
    "Չհաջողվեց թարմացնել գները։ Առկա վերլուծությունը հասանելի է մնում։",
  "Missing market price: {tickers}.": "Բացակայում է շուկայական գինը՝ {tickers}։",
  "Stale market price: {tickers}.": "Հնացած շուկայական գին՝ {tickers}։",
  "Affected values are excluded or marked unavailable.":
    "Ազդված արժեքները բացառված են կամ նշված են որպես անհասանելի։",
  "Portfolio summary": "Պորտֆելի ամփոփում",
  "Total cost basis": "Ընդհանուր ձեռքբերման արժեք",
  "Missing: {tickers}": "Բացակայում է՝ {tickers}",
  "Cash balance": "Կանխիկի մնացորդ",
  "Unrealized gain/loss": "Չիրացված շահույթ/վնաս",
  "Today’s gain/loss": "Այսօրվա շահույթ/վնաս",
  Unavailable: "Հասանելի չէ",
  "Transaction return": "Գործարքների եկամտաբերություն",
  "Disabled in Admin settings": "Անջատված է Ադմինի կարգավորումներում",
  "Recorded buys and sells only · realized {amount} · excludes dividends, fees, and external cash flows":
    "Միայն գրանցված գնումներն ու վաճառքները · իրացված՝ {amount} · առանց շահաբաժինների, միջնորդավճարների և արտաքին դրամական հոսքերի",
  "Record your buys and sells on the Transactions page to calculate this":
    "Սա հաշվարկելու համար գրանցեք ձեր գնումներն ու վաճառքները «Գործարքներ» էջում",
  "Your recorded buys and sells don't add up to your current shares yet; record the missing ones on the Transactions page":
    "Ձեր գրանցված գնումներն ու վաճառքները դեռ չեն համապատասխանում ձեր ընթացիկ բաժնետոմսերին․ գրանցեք բացակայողները «Գործարքներ» էջում",
  "Benchmark return": "Համեմատական ցուցանիշի եկամտաբերություն",
  "{value} pts": "{value} կետ",
  "Current holdings {value}, as if held": "Ընթացիկ դիրքեր՝ {value}, եթե պահված լինեին ամբողջ ժամանակահատվածում",
  "Holdings / risk warnings": "Դիրքեր / ռիսկի զգուշացումներ",

  // Analytics: allocation
  "Portfolio allocation": "Պորտֆելի բաշխում",
  "ETF and index values are shown for visibility but excluded from allocation limits and concentration warnings.":
    "ETF-ների և ինդեքսների արժեքները ցուցադրվում են տեղեկության համար, բայց չեն հաշվվում բաշխման սահմանաչափերում և կենտրոնացման զգուշացումներում։",
  Positions: "Դիրքեր",
  Industries: "Ճյուղեր",
  Sectors: "Ոլորտներ",
  "Asset types": "Ակտիվների տեսակներ",
  "Excluded from risk limits": "Բացառված է ռիսկի սահմանաչափերից",
  "Over {limit} limit": "Գերազանցում է {limit} սահմանաչափը",
  "Allocation unavailable": "Բաշխումը հասանելի չէ",
  "Current prices or classification data are missing.": "Բացակայում են ընթացիկ գները կամ դասակարգման տվյալները։",
  Unclassified: "Չդասակարգված",
  Other: "Այլ",
  "ETF / Index": "ETF / ինդեքս",
  "ETF/Index": "ETF/ինդեքս",
  "Not Applicable": "Կիրառելի չէ",
  Unknown: "Անհայտ",
  "Communication Services": "Կապի ծառայություններ",
  "Consumer Discretionary": "Ոչ առաջնային սպառողական ապրանքներ",
  "Consumer Staples": "Առաջնային սպառողական ապրանքներ",
  Energy: "Էներգետիկա",
  Financials: "Ֆինանսներ",
  "Health Care": "Առողջապահություն",
  Industrials: "Արդյունաբերություն",
  "Information Technology": "Տեղեկատվական տեխնոլոգիաներ",
  Materials: "Հումք և նյութեր",
  "Real Estate": "Անշարժ գույք",
  Utilities: "Կոմունալ ծառայություններ",
  "Common Stock": "Սովորական բաժնետոմս",
  "Preferred Stock": "Արտոնյալ բաժնետոմս",
  Trust: "Տրաստ",
  Index: "Ինդեքս",

  // Analytics: gains and losses
  Gains: "Շահույթներ",
  Losses: "Վնասներ",
  Show: "Ցույց տալ",
  "Top {count}": "Լավագույն {count}",
  "Gains and losses": "Շահույթ և վնաս",
  "Cost basis unavailable": "Ձեռքբերման արժեքը հասանելի չէ",
  "Weight {value}": "Կշիռ՝ {value}",
  "Share of unrealized gain/loss {value}": "Մասնաբաժինը չիրացված շահույթ/վնասում՝ {value}",
  "No matching contributors.": "Համապատասխան դիրքեր չկան։",

  // Analytics: risk limits and warnings
  "Configured thresholds": "Սահմանված շեմեր",
  "Risk limits": "Ռիսկի սահմանաչափեր",
  Critical: "Կրիտիկական",
  Informational: "Տեղեկատվական",
  "Current {current} · Limit {limit}": "Ընթացիկ՝ {current} · Սահմանաչափ՝ {limit}",
  "Holdings: {tickers}": "Դիրքեր՝ {tickers}",
  "No current-allocation limits are breached.": "Ընթացիկ բաշխման ոչ մի սահմանաչափ չի խախտված։",
  "{ticker} exceeds the position limit": "{ticker}-ը գերազանցում է դիրքի սահմանաչափը",
  "{ticker} represents {current} of portfolio value; the configured maximum is {limit}.":
    "{ticker}-ը կազմում է պորտֆելի արժեքի {current}-ը․ սահմանված առավելագույնը {limit} է։",
  "Cash is below the configured minimum": "Կանխիկը սահմանված նվազագույնից ցածր է",
  "Cash represents {current} of portfolio value; the configured minimum is {limit}.":
    "Կանխիկը կազմում է պորտֆելի արժեքի {current}-ը․ սահմանված նվազագույնը {limit} է։",
  "Top-three concentration is high": "Երեք խոշորագույն դիրքերի կենտրոնացումը բարձր է",
  "Top-five concentration is high": "Հինգ խոշորագույն դիրքերի կենտրոնացումը բարձր է",
  "The three largest non-fund positions represent {current} of portfolio value; the configured maximum is {limit}.":
    "Ոչ ֆոնդային երեք խոշորագույն դիրքերը կազմում են պորտֆելի արժեքի {current}-ը․ սահմանված առավելագույնը {limit} է։",
  "The five largest non-fund positions represent {current} of portfolio value; the configured maximum is {limit}.":
    "Ոչ ֆոնդային հինգ խոշորագույն դիրքերը կազմում են պորտֆելի արժեքի {current}-ը․ սահմանված առավելագույնը {limit} է։",
  "Speculative exposure exceeds its limit": "Սպեկուլյատիվ ներդրումները գերազանցում են իրենց սահմանաչափը",
  "Speculative categories represent {current} of portfolio value; the configured maximum is {limit}.":
    "Սպեկուլյատիվ կատեգորիաները կազմում են պորտֆելի արժեքի {current}-ը․ սահմանված առավելագույնը {limit} է։",
  "{group} exceeds the sector limit": "«{group}»-ը գերազանցում է ոլորտի սահմանաչափը",
  "{group} sector exposure represents {current} of portfolio value; the configured maximum is {limit}.":
    "«{group}» ոլորտը կազմում է պորտֆելի արժեքի {current}-ը․ սահմանված առավելագույնը {limit} է։",
  "{group} exceeds the asset type limit": "«{group}»-ը գերազանցում է ակտիվի տեսակի սահմանաչափը",
  "{group} asset type exposure represents {current} of portfolio value; the configured maximum is {limit}.":
    "«{group}» ակտիվի տեսակը կազմում է պորտֆելի արժեքի {current}-ը․ սահմանված առավելագույնը {limit} է։",

  // Analytics: advanced risk
  Risk: "Ռիսկ",
  "Risk analytics": "Ռիսկի վերլուծություն",
  "Top-three concentration": "Երեք խոշորագույն դիրքերի կենտրոնացում",
  "Top-five concentration": "Հինգ խոշորագույն դիրքերի կենտրոնացում",
  "Excludes funds and indexes": "Առանց ֆոնդերի և ինդեքսների",
  "Sum of the three largest non-fund position weights. Uses the latest available prices and is not a historical risk measure.":
    "Ոչ ֆոնդային երեք խոշորագույն դիրքերի կշիռների գումարը։ Օգտագործում է վերջին հասանելի գները և ռիսկի պատմական չափանիշ չէ։",
  "Sum of the five largest non-fund position weights. Uses the latest available prices and is not a historical risk measure.":
    "Ոչ ֆոնդային հինգ խոշորագույն դիրքերի կշիռների գումարը։ Օգտագործում է վերջին հասանելի գները և ռիսկի պատմական չափանիշ չէ։",
  "Not enough history": "Պատմական տվյալները բավարար չեն",
  "Requires {requirement}.": "Պահանջվում է՝ {requirement}։",
  "{metric} is calculated over the selected period. {requirement} are required; results can be sensitive to the selected period and data quality.":
    "«{metric}» ցուցանիշը հաշվարկվում է ընտրված ժամանակահատվածի համար։ Պահանջվում է՝ {requirement}․ արդյունքները կարող են կախված լինել ընտրված ժամանակահատվածից և տվյալների որակից։",
  "Portfolio volatility": "Պորտֆելի տատանողականություն",
  "Maximum drawdown": "Առավելագույն անկում",
  "Beta versus benchmark": "Բետա՝ համեմատական ցուցանիշի նկատմամբ",
  "Sharpe ratio": "Շարպի գործակից",
  "Downside deviation": "Բացասական շեղում",
  "Highly correlated holdings": "Բարձր կոռելյացված դիրքեր",
  "Daily portfolio history": "Պորտֆելի օրական պատմություն",
  "Historical portfolio values": "Պորտֆելի պատմական արժեքներ",
  "Aligned portfolio and benchmark returns": "Պորտֆելի և համեմատական ցուցանիշի համադրված եկամտաբերություններ",
  "Portfolio returns and risk-free rates": "Պորտֆելի եկամտաբերություններ և առանց ռիսկի տոկոսադրույքներ",
  "Historical portfolio returns": "Պորտֆելի պատմական եկամտաբերություններ",
  "Aligned holding return history": "Դիրքերի եկամտաբերության համադրված պատմություն",

  // Analytics: allocation guide
  "What is a normal allocation": "Ինչ է նորմալ բաշխումը",
  Learn: "Սովորել",
  "What's considered normal?": "Ի՞նչն է համարվում նորմալ",
  Hide: "Թաքցնել",
  "There is no single rule, but these are widely used rules of thumb for a diversified portfolio. They are general education, not advice for your situation.":
    "Միասնական կանոն չկա, բայց սրանք դիվերսիֆիկացված պորտֆելի համար լայնորեն կիրառվող գործնական կանոններ են։ Դրանք ընդհանուր կրթական տեղեկություն են, ոչ թե խորհուրդ ձեր իրավիճակի համար։",
  "One position:": "Մեկ դիրք․",
  "usually 5–10% at most. Above about 20%, one company's bad news can hurt the whole portfolio. Your limit: {limit}.":
    "սովորաբար առավելագույնը 5–10%։ Մոտ 20%-ից բարձրի դեպքում մեկ ընկերության վատ լուրերը կարող են վնասել ամբողջ պորտֆելին։ Ձեր սահմանաչափը՝ {limit}։",
  "One sector or industry:": "Մեկ ոլորտ կամ ճյուղ․",
  "about 20–25% at most; the S&P 500's largest sector (technology) is roughly 30%. Your limit: {limit}.":
    "առավելագույնը մոտ 20–25%․ S&P 500-ի ամենամեծ ոլորտը (տեխնոլոգիաները) կազմում է մոտ 30%։ Ձեր սահմանաչափը՝ {limit}։",
  "Asset types:": "Ակտիվների տեսակներ․",
  "a mix of stocks, bonds, and cash that fits your time horizon; the classic balanced mix is 60% stocks / 40% bonds, and longer horizons usually hold more stocks. Your limit per type: {limit}.":
    "բաժնետոմսերի, պարտատոմսերի և կանխիկի համադրություն, որը համապատասխանում է ձեր ժամկետին․ դասական հավասարակշռված համադրությունը 60% բաժնետոմս / 40% պարտատոմս է, իսկ ավելի երկար ժամկետների դեպքում սովորաբար ավելի շատ բաժնետոմսեր են պահում։ Ձեր սահմանաչափը յուրաքանչյուր տեսակի համար՝ {limit}։",
  "Cash:": "Կանխիկ․",
  "2–5% in the portfolio for opportunities, with 3–6 months of expenses kept separately as an emergency fund. Your minimum: {limit}.":
    "պորտֆելում 2–5%՝ հնարավորությունների համար, իսկ 3–6 ամսվա ծախսերը առանձին պահված՝ որպես արտակարգ իրավիճակների ֆոնդ։ Ձեր նվազագույնը՝ {limit}։",
  "Speculative holdings:": "Սպեկուլյատիվ դիրքեր․",
  "5–10% at most, money you could afford to lose. Your limit: {limit}.":
    "առավելագույնը 5–10%, այնպիսի գումար, որը կարող եք թույլ տալ կորցնել։ Ձեր սահմանաչափը՝ {limit}։",
  "ETFs and index funds are already diversified, so they don't count toward these limits.":
    "ETF-ները և ինդեքսային ֆոնդերն արդեն դիվերսիֆիկացված են, ուստի չեն հաշվվում այս սահմանաչափերում։",

  // Fund look-through in the allocation view
  "Fund exposure": "Ֆոնդերի միջոցով ներդրումներ",
  "Direct holdings": "Ուղղակի դիրքեր",
  "Include fund holdings": "Ներառել ֆոնդերի դիրքերը",
  "Funds count through their top 10 holdings and sector weights; the rest of each fund is shown as “other holdings”.":
    "Ֆոնդերը հաշվվում են իրենց 10 խոշորագույն դիրքերով և ոլորտային կշիռներով, իսկ յուրաքանչյուր ֆոնդի մնացած մասը ցույց է տրվում որպես «այլ դիրքեր»։",
  "{fund} · other holdings": "{fund} · այլ դիրքեր",

  // Support us
  "Support MyPortfolioBuddy": "Աջակցեք MyPortfolioBuddy-ին",
  "We build MyPortfolioBuddy for you, and only for you. There are no sponsors, no ads, and we never sell your data. To keep it that way, we need your help.":
    "Մենք ստեղծում ենք MyPortfolioBuddy-ն ձեզ համար և միայն ձեզ համար։ Չկան հովանավորներ, չկա գովազդ, և մենք երբեք չենք վաճառում ձեր տվյալները։ Որպեսզի այդպես էլ մնա, մեզ անհրաժեշտ է ձեր օգնությունը։",
  "No sponsors": "Առանց հովանավորների",
  "Nobody pays us to show you anything.": "Ոչ ոք մեզ չի վճարում՝ ձեզ որևէ բան ցույց տալու համար։",
  "No ads": "Առանց գովազդի",
  "Your screen is for your money, not for banners.": "Ձեր էկրանը ձեր գումարի համար է, ոչ թե գովազդային պաստառների։",
  "Your data stays yours": "Ձեր տվյալները մնում են ձերը",
  "We never sell or share your data.": "Մենք երբեք չենք վաճառում կամ փոխանցում ձեր տվյալները։",
  "{price} a month": "{price} ամսական",
  "About the price of a coffee.": "Մոտավորապես մեկ սուրճի գին։",
  "AI reviews and market data cost us money every month. Subscribing keeps Buddy running and growing for everyone.":
    "AI վերանայումները և շուկայական տվյալներն ամեն ամիս մեզ վրա գումար են նստում։ Ձեր բաժանորդագրությունն օգնում է, որ Buddy-ն աշխատի և զարգանա բոլորի համար։",
  "If Buddy helps you spot just one thing worth a second look in your portfolio, it has paid for itself.":
    "Եթե Buddy-ն օգնի ձեզ ձեր պորտֆելում նկատել թեկուզ մեկ բան, որն արժե կրկին ուսումնասիրել, այն արդեն իրեն արդարացրել է։",
  "Subscribe · $9/month": "Բաժանորդագրվել · $9/ամիս",
  "Subscriptions open soon. Thank you for being here early.":
    "Բաժանորդագրությունը շուտով հասանելի կլինի։ Շնորհակալություն, որ մեզ հետ եք հենց սկզբից։",
};

export default analysis;
