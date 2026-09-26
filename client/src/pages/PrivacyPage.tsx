import { Link } from 'react-router';
import { AGENT_LOG_RETENTION_DAYS, PASSWORD_RESET_MINUTES } from '@lct/shared';

const UPDATED = 'September 26, 2026';
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;

/** Plain-language privacy policy. Keep it in step with what the code actually does. */
export default function PrivacyPage() {
  return (
    <main className="legal">
      <Link to="/" className="back-link">
        ← LeetCode Tracker
      </Link>
      <h1>Privacy policy</h1>
      <p className="muted">Last updated {UPDATED}</p>

      <p>
        LeetCode Tracker helps you track your LeetCode practice. This page explains what it stores, why, who else
        handles it, and how to remove it. In short: we keep only what the app needs to work, we don't sell data, and
        there are no ads, analytics or tracking cookies.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> username, email, and your password as a one-way hash (we can't read it).
        </li>
        <li>
          <strong>What you add:</strong> problems, statuses, tags, notes, approaches and solution code.
        </li>
        <li>
          <strong>Your practice history:</strong> when you solved or reviewed each problem, for reviews, streaks and
          charts.
        </li>
        <li>
          <strong>LeetCode username</strong>, if you connect one. We read only your public LeetCode profile (your recent
          accepted problems); we never ask for your LeetCode password.
        </li>
        <li>
          <strong>AI runs:</strong> when you use an AI feature, the request and the answer are kept so you can review
          them on the AI activity page. They're deleted automatically after {AGENT_LOG_RETENTION_DAYS} days.
        </li>
        <li>
          <strong>Browser extension tokens:</strong> stored only as a one-way hash, with a name and when each was last
          used.
        </li>
      </ul>

      <h2>Who else handles your data</h2>
      <ul>
        <li>
          <strong>Google (Gemini API)</strong> generates AI answers. When you use an AI feature, the problem, your
          question, and where relevant your notes and code are sent to Google for that request. The hints chat lets you
          keep your code out. Avoid putting personal information in notes or code.
        </li>
        <li>
          <strong>LeetCode</strong> is asked for public problem details and, if you connect a username, your public
          recent solves.
        </li>
        <li>
          <strong>MongoDB Atlas</strong> (database), <strong>Render</strong> (server) and <strong>Vercel</strong>{' '}
          (website) host the app.
        </li>
        <li>
          <strong>Resend</strong> delivers password reset emails.
        </li>
      </ul>

      <h2>In your browser</h2>
      <p>
        Your sign-in session is kept in your browser's local storage until you sign out. The hints chat is kept in your
        tab's session storage. There are no tracking or advertising cookies.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Your account and what you've added stay until you delete them. AI runs are deleted after{' '}
        {AGENT_LOG_RETENTION_DAYS} days, and password reset links expire after {PASSWORD_RESET_MINUTES} minutes.
      </p>

      <h2>Your choices</h2>
      <p>
        In <Link to="/settings">Settings</Link> you can download everything we store about you, delete your account and
        all its data for good, disconnect LeetCode, revoke extension tokens, and sign out on every device.
      </p>

      <h2>Security</h2>
      <p>
        Connections use HTTPS. Passwords and tokens are stored only as hashes, each user can only reach their own data,
        and sign-in and AI use are rate-limited.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes, the date at the top changes too.
        {CONTACT ? (
          <>
            {' '}
            Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </>
        ) : null}
      </p>
    </main>
  );
}
