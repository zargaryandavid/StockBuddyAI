/** Armenian (library): the Education Library of books. Keys are the exact English text. Book titles stay in English. */
const library: Record<string, string> = {
  // ── Library page ────────────────────────────────────────────────────────────
  Library: "Գրադարան",
  "Finance books worth your time. Rate the ones you've read.":
    "Ֆինանսական գրքեր, որոնք արժե կարդալ։ Գնահատեք նրանք, որոնք արդեն կարդացել եք։",
  "Ratings are unavailable right now.": "Գնահատականներն այս պահին հասանելի չեն։",
  "Top 5 by readers": "Ընթերցողների թոփ 5-ը",
  "Our picks": "Մեր ընտրությունը",
  "Our pick": "Մեր ընտրությունը",
  "No ratings yet. Read one of these and be the first to rate it.":
    "Գնահատականներ դեռ չկան։ Կարդացեք այս գրքերից մեկը և առաջինը գնահատեք այն։",
  "All books": "Բոլոր գրքերը",
  "{title} by {author}": "{title}, հեղինակ՝ {author}",
  "Not rated yet": "Դեռ գնահատված չէ",
  "As an Amazon Associate, StockBuddy earns from qualifying purchases.":
    "Որպես Amazon Associate՝ StockBuddy-ն եկամուտ է ստանում որակավորվող գնումներից։",
  "Buy on Amazon": "Գնել Amazon-ում",
  "Buy {title} on Amazon (opens in a new tab)": "Գնել «{title}» գիրքը Amazon-ում (բացվում է նոր ներդիրում)",
  "Cover of {title}": "«{title}» գրքի շապիկը",
  "Rated {average} out of 5 by 1 reader": "1 ընթերցողի գնահատականը՝ {average}՝ 5-ից",
  "Rated {average} out of 5 by {count} readers": "{count} ընթերցողի միջին գնահատականը՝ {average}՝ 5-ից",
  "Rated {stars} out of 5": "Գնահատական՝ {stars}՝ 5-ից",

  // ── Book dialog and rating ──────────────────────────────────────────────────
  "Your rating": "Ձեր գնահատականը",
  "Read it?": "Կարդացե՞լ եք այն",
  "I've read it — rate it": "Կարդացել եմ — գնահատել",
  "Rate {stars} out of 5": "Գնահատել {stars}՝ 5-ից",
  "Comment (optional)": "Մեկնաբանություն (ըստ ցանկության)",
  "What did you take away from it?": "Ի՞նչ եք վերցրել այս գրքից",
  "{used} of {max} characters": "{used}/{max} նիշ",
  "Remove my rating": "Հեռացնել իմ գնահատականը",
  "Save rating": "Պահպանել գնահատականը",
  "Choose 1 to 5 stars.": "Ընտրեք 1-ից 5 աստղ։",
  "Your rating is saved.": "Ձեր գնահատականը պահպանված է։",
  "Could not save your rating.": "Չհաջողվեց պահպանել ձեր գնահատականը։",
  "Your rating was removed.": "Ձեր գնահատականը հեռացվեց։",
  "Could not remove your rating.": "Չհաջողվեց հեռացնել ձեր գնահատականը։",
  "What readers say": "Ինչ են ասում ընթերցողները",
  "No comments yet.": "Մեկնաբանություններ դեռ չկան։",

  // ── Topics ──────────────────────────────────────────────────────────────────
  "Index investing": "Ինդեքսային ներդրումներ",
  "Value investing": "Արժեքային ներդրումներ",
  "Stock picking": "Բաժնետոմսերի ընտրություն",
  "Money mindset": "Փողի հանդեպ մտածելակերպ",
  "Financial independence": "Ֆինանսական անկախություն",
  "Money basics": "Ֆինանսների հիմունքներ",

  // ── Book descriptions ───────────────────────────────────────────────────────
  "A plain-spoken case for spending less than you earn, avoiding debt, and putting the rest in a broad stock index fund.":
    "Պարզ ու անկեղծ փաստարկ՝ հօգուտ վաստակածից քիչ ծախսելու, պարտքերից խուսափելու և մնացածը լայն բաժնետոմսային ինդեքսային ֆոնդում ներդնելու։",
  "Short stories showing that how we behave with money matters more than how much finance we know.":
    "Կարճ պատմություններ այն մասին, որ փողի հետ մեր վարքն ավելի կարևոր է, քան ֆինանսների մասին մեր գիտելիքները։",
  "The founder of Vanguard explains why owning the whole market at low cost beats trying to outguess it.":
    "Vanguard-ի հիմնադիրը բացատրում է, թե ինչու է ամբողջ շուկան ցածր ծախսերով ունենալն ավելի արդյունավետ, քան այն գուշակելու փորձերը։",
  "The classic guide to treating stocks as parts of real businesses and always keeping a margin of safety.":
    "Դասական ուղեցույց՝ բաժնետոմսերին որպես իրական բիզնեսների մասնաբաժինների վերաբերվելու և միշտ անվտանգության պաշար պահելու մասին։",
  "A tour of market history and theory that ends with a practical, low-cost plan for ordinary investors.":
    "Շուկայի պատմության և տեսության ակնարկ, որն ավարտվում է սովորական ներդրողների համար գործնական, ցածր ծախսերով ծրագրով։",
  "A step-by-step handbook for building a simple, diversified portfolio and leaving it alone.":
    "Քայլ առ քայլ ձեռնարկ՝ պարզ, դիվերսիֆիկացված պորտֆել կազմելու և այն հանգիստ թողնելու համար։",
  "A nine-step program for measuring what your spending really costs in hours of your life.":
    "Ինը քայլից բաղկացած ծրագիր՝ հասկանալու, թե ձեր ծախսերն իրականում ձեր կյանքի քանի ժամն արժեն։",
  "Research on real American millionaires, who mostly live modestly and build wealth quietly over decades.":
    "Հետազոտություն իրական ամերիկացի միլիոնատերերի մասին, որոնք հիմնականում համեստ են ապրում և տասնամյակների ընթացքում աննկատ հարստություն կուտակում։",
  "A six-week plan to automate your saving and investing so you can spend guilt-free on what you love.":
    "Վեցշաբաթյա ծրագիր՝ խնայողություններն ու ներդրումներն ավտոմատացնելու համար, որպեսզի առանց մեղքի զգացման ծախսեք այն բանի վրա, ինչ սիրում եք։",
  "An argument for spending your money on experiences while you can enjoy them, not hoarding it forever.":
    "Փաստարկ՝ հօգուտ փողը փորձառությունների վրա ծախսելու, քանի դեռ կարող եք դրանք վայելել, այլ ոչ թե այն անվերջ կուտակելու։",
  "A legendary fund manager shows how everyday observations can lead you to promising companies.":
    "Լեգենդար ֆոնդային կառավարիչը ցույց է տալիս, թե ինչպես կարող են առօրյա դիտարկումները ձեզ հեռանկարային ընկերությունների հասցնել։",
  "Fifteen questions for finding outstanding growth companies worth holding for many years.":
    "Տասնհինգ հարց՝ աճի բացառիկ ընկերություններ գտնելու համար, որոնց բաժնետոմսերն արժե պահել երկար տարիներ։",
  "The deep, technical textbook on valuing stocks and bonds from their financial statements.":
    "Խորը, տեխնիկական դասագիրք՝ բաժնետոմսերն ու պարտատոմսերը ֆինանսական հաշվետվությունների հիման վրա գնահատելու մասին։",
  "A story-driven push to think about assets that earn income rather than a paycheck alone.":
    "Պատմությունների միջոցով կոչ՝ մտածել եկամուտ բերող ակտիվների մասին, այլ ոչ միայն աշխատավարձի։",
  "Old-fashioned parables about paying yourself first and letting savings work for you.":
    "Հին առակներ այն մասին, թե ինչպես նախ ինքներդ ձեզ վճարել և թույլ տալ, որ խնայողություններն աշխատեն ձեզ համար։",

  // ── Admin: Library ──────────────────────────────────────────────────────────
  "Amazon affiliate tag": "Amazon-ի գործընկերային թեգ",
  "Added to the Library's Buy on Amazon links. Leave empty for plain links.":
    "Ավելացվում է Գրադարանի «Գնել Amazon-ում» հղումներին։ Թողեք դատարկ՝ սովորական հղումների համար։",

  // ── Messages from the API ───────────────────────────────────────────────────
  "Book not found": "Գիրքը չի գտնվել",
  "Amazon affiliate tag must be at most 64 letters, digits, or hyphens":
    "Amazon-ի գործընկերային թեգը պետք է պարունակի առավելագույնը 64 տառ, թիվ կամ գծիկ",
};

export default library;
