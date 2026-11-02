import Link from "next/link"
import { config } from "@/lib/config"
import { formatLongDate, startOfDay } from "@/lib/format"
import { LEGAL_UPDATED } from "../updated"

export const metadata = { title: "Privacy Policy" }

export default function PrivacyPage() {
  const { appName, provider, contactEmail } = config
  const mail = <a href={`mailto:${contactEmail}`}>{contactEmail}</a>

  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="lp-legal-meta">Last updated {formatLongDate(startOfDay(LEGAL_UPDATED))}</p>

      <div className="lp-legal-summary">
        <p>
          <strong>The short version:</strong> we keep your business&apos;s records only to run {appName} for you. We don&apos;t sell them,
          don&apos;t show ads, and don&apos;t use tracking cookies. You can download everything, and ask us to delete everything, any time.
        </p>
        <p className="mb-0">
          This policy follows the Data Privacy Act of 2012 (Republic Act No. 10173). It works together with our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>

      <h2>Who is responsible for what</h2>
      <p>
        {appName} is run by {provider} (&ldquo;we&rdquo;). There are two kinds of information here, and the law treats them differently:
      </p>
      <ul>
        <li>
          <strong>Your account information</strong>, like the owner&apos;s email address and the payments you report to us. For this, we
          are the personal information controller: we decide how it&apos;s used, as described below.
        </li>
        <li>
          <strong>The records your business keeps in {appName}</strong>, like customers, employees and sales. For these, your business
          is the personal information controller and we are its processor: we store and process them only to provide {appName} to
          you, following your instructions. If you are a customer or employee of a business that uses {appName}, please contact that
          business first about your information; we will help them respond.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>When you sign up:</strong> your business name and type, the owner&apos;s email address and a password. Passwords are
          stored only in scrambled (hashed) form; nobody, including us, can read them.
        </li>
        <li>
          <strong>Staff logins:</strong> a username and password for each person you add, and their role and permissions. Staff
          logins don&apos;t need an email address.
        </li>
        <li>
          <strong>What your business records:</strong> products, stock, suppliers and prices; sales, payment methods and reference
          numbers; customers&apos; names, phone numbers, addresses and what they owe; the name and ID number of Senior Citizen and PWD
          customers when you give them the discount; employees&apos; names, badges and clock-in times; vehicles, trips and fuel; and a log
          of who did what in your account.
        </li>
        <li>
          <strong>Payments to us:</strong> the amount, plan and reference number you send from Billing, and any note you add.
        </li>
        <li>
          <strong>Security records:</strong> when someone types a wrong password, we keep a scrambled (hashed) form of the login name
          and the IP address it came from, to stop people guessing passwords. These are deleted after about a day.
        </li>
      </ul>
      <p>
        We don&apos;t use analytics or advertising tools, and we don&apos;t collect your location. The servers that host {appName}{" "}
        may keep short-lived technical logs (like IP addresses and errors) to keep the service running and secure.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>to run {appName}: store your records, show your reports, and print your receipts and labels;</li>
        <li>
          to send emails about your account: confirming your email, resetting your password, payment confirmations, reminders before
          your trial or paid time ends, and the sales summary (which owners can turn off in Settings);
        </li>
        <li>to check the payments you report and keep your account active;</li>
        <li>to keep {appName} secure, and to help when you ask us for support.</li>
      </ul>
      <p>
        We don&apos;t sell or rent personal information, and we don&apos;t use your business&apos;s records for advertising or for
        anything other than providing {appName} to you.
      </p>

      <h2>Cookies</h2>
      <p>
        We only use cookies that keep you logged in. They can&apos;t be read by scripts on the page and aren&apos;t used to track you
        anywhere else. There are no advertising or analytics cookies.
      </p>

      <h2>Who else handles it</h2>
      <p>We use a few companies to run {appName}. They handle information only to provide their service to us:</p>
      <ul>
        <li>
          <strong>Supabase</strong> stores the database and handles logins. Your data is stored on its servers in Sydney, Australia.
        </li>
        <li>
          <strong>Vercel</strong> hosts the website. The app runs on its servers in Sydney, Australia, and pages are delivered through
          its worldwide network.
        </li>
        <li>
          <strong>Resend</strong> delivers our emails, so it receives the recipient&apos;s email address and the email&apos;s content.
        </li>
      </ul>
      <p>
        Because these servers are outside the Philippines, your information is transferred abroad. These providers protect it with
        security measures such as encryption, and we stay responsible for it under the Data Privacy Act. We share information with
        others only if the law requires it, for example a valid court order.
      </p>

      <h2>How we protect it</h2>
      <ul>
        <li>Everything is sent over an encrypted connection (HTTPS).</li>
        <li>
          Each business&apos;s records are kept apart by the database itself, so one business can&apos;t see or change another&apos;s.
        </li>
        <li>Passwords are hashed, repeated wrong passwords are locked out, and our own admin access needs two-step login.</li>
        <li>Owners decide what each staff login can see and do, and important actions are written to an activity log.</li>
      </ul>
      <p>
        No system is perfectly secure. If a breach puts personal information at real risk, we will tell the affected business and the
        National Privacy Commission as the law requires.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your records for as long as you have an account. If your trial or paid time ends, we keep them, locked, until you ask
        us to delete them, so you can come back and pick up where you left off. When the owner asks us to close the account, we
        delete its records from our database within 30 days.
      </p>

      <h2>Your rights</h2>
      <p>Under the Data Privacy Act you have the right to:</p>
      <ul>
        <li>be told how your personal information is used (this policy);</li>
        <li>see the personal information we have about you, and get a copy;</li>
        <li>have wrong information corrected;</li>
        <li>object to processing, and have your information deleted or blocked;</li>
        <li>get your information in a format you can use elsewhere;</li>
        <li>be compensated for damages from wrongful processing; and</li>
        <li>
          file a complaint with the National Privacy Commission (<a href="https://privacy.gov.ph">privacy.gov.ph</a>).
        </li>
      </ul>
      <p>
        Owners can download all of their business&apos;s records any time from Settings or Billing, and correct most information
        themselves in the app. For anything else, write to us at {mail}. We may ask you to confirm who you are first.
      </p>

      <h2>Age</h2>
      <p>
        {appName} is for businesses. Only adults may sign up. Businesses that record information about minors, such as young
        employees, are responsible for doing so lawfully.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change how we handle personal information, we&apos;ll update this page and change the date at the top. For important
        changes, we&apos;ll also email account owners before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        For questions or requests about privacy, write to {provider} at {mail}.
      </p>
    </article>
  )
}
