import Link from "next/link"
import { config } from "@/lib/config"
import { formatLongDate, price, startOfDay } from "@/lib/format"
import { LEGAL_UPDATED } from "../updated"

export const metadata = { title: "Terms of Service" }

export default function TermsPage() {
  const { appName, provider, contactEmail, trialDays } = config
  const yearly = config.price.yearly
  const mail = <a href={`mailto:${contactEmail}`}>{contactEmail}</a>

  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="lp-legal-meta">Last updated {formatLongDate(startOfDay(LEGAL_UPDATED))}</p>

      <div className="lp-legal-summary">
        <p>
          <strong>The short version:</strong> try {appName} free for {trialDays} days. After that it&apos;s {price(config.price.monthly)} a
          month, paid by GCash or bank transfer. Stop whenever you like; there are no refunds for time already paid. Your records are
          yours: we keep them safe, never sell them, and you can download all of them any time.
        </p>
        <p className="mb-0">The full terms below are what count.</p>
      </div>

      <h2>Who we are</h2>
      <p>
        {appName} is an online service for running a small business: inventory, point of sale, attendance and fleet records. It is
        run by {provider} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). You can reach us at {mail}.
      </p>
      <p>
        These terms are an agreement between us and the business that signs up (&ldquo;you&rdquo;). By creating an account or using{" "}
        {appName}, you agree to them. If you sign up for a business, you confirm that you&apos;re allowed to agree on its behalf.
      </p>

      <h2>Your account and logins</h2>
      <ul>
        <li>The person who signs up becomes the owner of the business&apos;s account. You must be at least 18.</li>
        <li>Give us a real email address. We use it to confirm your account, reset your password and send account notices.</li>
        <li>
          You can create logins for your staff. You&apos;re responsible for who you give logins to and for what is done with them, so
          keep passwords private and remove logins people no longer need.
        </li>
        <li>Tell us right away at {mail} if you think someone got into your account.</li>
      </ul>

      <h2>Free trial and payment</h2>
      <ul>
        <li>New businesses get a {trialDays}-day free trial with every feature. No payment details are needed to start.</li>
        <li>
          After the trial, {appName} costs {price(config.price.monthly)} per month
          {yearly ? ` or ${price(yearly)} per year` : ""}. Prices are in Philippine pesos.
        </li>
        <li>
          You pay by GCash or bank transfer to the account shown on your Billing page, then send us the reference number there. We
          add the paid time to your account once we&apos;ve confirmed the payment.
        </li>
        <li>
          Paid time is added after any time you have left, so paying early doesn&apos;t lose you any days. There is no automatic
          renewal: nothing is charged unless you pay.
        </li>
        <li>If we change the price, we&apos;ll tell you by email at least 30 days before it applies to you.</li>
      </ul>

      <h2>Cancelling and refunds</h2>
      <p>
        You can stop at any time by not paying again; there&apos;s nothing to cancel. Your access continues until the end of the time
        you&apos;ve paid for. <strong>Payments are not refundable</strong>, including for unused days, except where Philippine law
        requires a refund.
      </p>

      <h2>When your paid time ends</h2>
      <p>
        When your trial or paid time ends, your account is locked: you can still log in, see Billing and download your data, but not
        use the rest of {appName}. <strong>Nothing is deleted.</strong> Pay again and you continue where you left off.
      </p>
      <p>
        We keep a locked account&apos;s records until you ask us to delete them. To close your account and delete everything, write to
        us at {mail} from the owner&apos;s email address.
      </p>

      <h2>Your data is yours</h2>
      <ul>
        <li>
          Everything you enter (products, sales, customers, employees, trips and so on) belongs to you. You let us store and process
          it only to run {appName} for you.
        </li>
        <li>We don&apos;t sell your data, show you ads, or look at your records except to help you when you ask, or to fix a problem.</li>
        <li>
          You can download all of your records as an Excel file any time, from Settings or Billing. We recommend doing this now and
          then as your own backup.
        </li>
        <li>
          When you enter information about other people, such as customers, Senior Citizen or PWD card holders and employees, you are
          responsible for having the right to collect it under the Data Privacy Act of 2012. Our{" "}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle it for you.
        </li>
      </ul>

      <h2>Receipts, taxes and records</h2>
      <ul>
        <li>
          Receipts printed from {appName} are <strong>not official receipts or invoices</strong>. {appName} is not a BIR-accredited
          point-of-sale system. If your business must issue official receipts, use your registered booklet or system for that.
        </li>
        <li>
          {appName} works out discounts (including the Senior Citizen and PWD discount), totals, profit and stock from the settings and
          numbers you enter. Check that your settings are right for your business. You remain responsible for your taxes, discounts
          required by law, and the records the government requires you to keep.
        </li>
      </ul>

      <h2>Fair use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use {appName} for anything illegal, or to store information you have no right to keep;</li>
        <li>try to reach another business&apos;s records, break or test our security, or get around the login limits;</li>
        <li>overload the service on purpose, or copy, resell or rent out access to {appName};</li>
        <li>upload anything harmful, such as viruses.</li>
      </ul>
      <p>
        If an account breaks these terms, we may suspend it. Unless it&apos;s urgent or illegal, we&apos;ll tell you first by email and give
        you a chance to fix it, and you can still download your data.
      </p>

      <h2>Keeping it running</h2>
      <p>
        We work to keep {appName} available and your data safe, but we can&apos;t promise it will never be interrupted, for example by
        maintenance, internet problems or outages at the companies that host it. Some features, like Quick Scan and the POS, need an
        internet connection to save.
      </p>
      <p>We may improve, change or remove features over time. If a change takes away something important you pay for, we&apos;ll tell you first.</p>

      <h2>Limits of our responsibility</h2>
      <p>
        {appName} is provided &ldquo;as is&rdquo;. As far as the law allows, we are not responsible for indirect losses, such as lost
        profits or lost sales, that come from using or not being able to use {appName}, and our total responsibility for any claim is
        limited to what you paid us in the 3 months before it. Nothing in these terms limits rights you have under Philippine law that
        can&apos;t be limited by agreement.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. If a change matters, we&apos;ll email the owner or show a notice in the app before it takes effect.
        Using {appName} after that means you accept the new terms. The date at the top shows the latest version.
      </p>

      <h2>Law and disputes</h2>
      <p>
        These terms are governed by the laws of the Republic of the Philippines. If there&apos;s a problem, write to us first at {mail}{" "}
        and we&apos;ll try to sort it out together.
      </p>
    </article>
  )
}
