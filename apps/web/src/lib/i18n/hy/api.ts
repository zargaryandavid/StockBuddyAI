/** Armenian (api): messages the API sends back, shown to people as-is. Keys are the exact English. */
const api: Record<string, string> = {
  // Ask Buddy and screenshot limits (AI_LIMIT_MESSAGES)
  "You've used today's screenshot imports. Try again tomorrow, or add holdings by hand.":
    "Այսօրվա սքրինշոթների ներմուծումներն արդեն օգտագործել եք։ Փորձեք վաղը կամ ավելացրեք դիրքերը ձեռքով։",
  "You've used this month's Ask Buddy tokens. They reset on the 1st.":
    "Այս ամսվա «Հարցրեք Buddy-ին» թոքեններն արդեն օգտագործել եք։ Դրանք կվերականգնվեն ամսի 1-ին։",

  // Sign-in and access
  "Your session has expired. Please sign in again.":
    "Ձեր սեսիան ավարտվել է։ Խնդրում ենք կրկին մուտք գործել։",
  "Bearer token required": "Անհրաժեշտ է մուտք գործել",
  "Admin access required": "Անհրաժեշտ է ադմինի մուտք",
  "Not allowed": "Թույլատրված չէ",
  'Type "delete" to confirm': "Հաստատելու համար մուտքագրեք «delete»",
  "The admin account can't be deleted here. Change ADMIN_LOGIN_EMAIL first.":
    "Ադմինի հաշիվը այստեղ հնարավոր չէ ջնջել։ Նախ փոխեք ADMIN_LOGIN_EMAIL-ը։",

  // Not found
  "Portfolio not found": "Պորտֆելը չի գտնվել",
  "Entry not found": "Գրառումը չի գտնվել",
  "Asset not found": "Ակտիվը չի գտնվել",
  "Reminder not found": "Հիշեցումը չի գտնվել",
  "Wish not found": "Ցանկությունը չի գտնվել",
  "Link not found": "Հղումը չի գտնվել",
  "This link is not active": "Այս հղումն ակտիվ չէ",
  "Connection not found": "Կապակցումը չի գտնվել",
  "Article not found": "Հոդվածը չի գտնվել",
  "Analysis not found": "Վերլուծությունը չի գտնվել",

  // Wishlist
  "This wish is already on the list": "Այս ցանկությունն արդեն ցուցակում է",
  "The 300 wishes exercise is full": "300 ցանկությունների վարժությունն արդեն լրացված է",

  // Pictures
  "Use a PNG, JPEG, WebP, or GIF picture": "Օգտագործեք PNG, JPEG, WebP կամ GIF նկար",
  "The picture is empty": "Նկարը դատարկ է",
  "Pictures can be up to 5 MB": "Նկարի չափը կարող է լինել մինչև 5 ՄԲ",
  "The picture could not be stored": "Չհաջողվեց պահպանել նկարը",
  "OPENAI_API_KEY is required for picture extraction":
    "Նկարից տվյալներ դուրս բերելու համար անհրաժեշտ է OPENAI_API_KEY",
  "Upload a PNG, JPEG, or WebP image": "Վերբեռնեք PNG, JPEG կամ WebP նկար",
  "Image must be between 1 byte and 8 MB": "Նկարի չափը պետք է լինի 1 բայթից մինչև 8 ՄԲ",
  "OpenAI returned an invalid portfolio result": "OpenAI-ը վերադարձրեց պորտֆելի անվավեր արդյունք",
  "OpenAI response did not contain output text": "OpenAI-ի պատասխանը տեքստ չէր պարունակում",

  // Market data and transactions
  "One of the tickers is not valid": "Տիկերներից մեկն անվավեր է",
  "Pick a start date within the last 10 years": "Ընտրեք սկզբի ամսաթիվ վերջին 10 տարվա ընթացքում",
  "Send between 1 and 60 tickers": "Ուղարկեք 1-ից 60 տիկեր",
  "Cannot sell a position not held": "Հնարավոր չէ վաճառել դիրք, որը չունեք",
  "Sale exceeds the held quantity": "Վաճառքը գերազանցում է առկա քանակը",
  "The first MVP can analyze only a ticker held in this portfolio":
    "Այս տարբերակը կարող է վերլուծել միայն այս պորտֆելում առկա տիկերը",
};

export default api;
