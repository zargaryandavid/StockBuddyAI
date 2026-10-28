import Image from "next/image";

/** A gold-edged card with a round portrait and a quote, beside the dollar bills on sign-in. */
export function InvestorQuote({
  quote,
  author,
  photo,
}: {
  quote: string;
  author: string;
  /** Public path of a square photo of the person quoted. */
  photo: string;
}) {
  return (
    <figure className="investor-quote">
      <Image className="investor-portrait" src={photo} alt={author} width={72} height={72} unoptimized />
      <blockquote>{quote}</blockquote>
      <figcaption>{author}</figcaption>
    </figure>
  );
}
