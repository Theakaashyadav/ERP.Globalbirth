import { CheckCircle2, Download, ShieldCheck, Smartphone } from "lucide-react";

export default function AppDownloadPage() {
  return <main className="appDownloadPage">
    <section className="appDownloadHero">
      <div className="appDownloadLogo"><Smartphone size={42}/></div>
      <span>OFFICIAL EMPLOYEE APPLICATION</span>
      <h1>Download Global One</h1>
      <p>Install the secure Android employee app for attendance, assigned leads, alerts and profile access.</p>
      <a className="appDownloadButton" href="/downloads/GlobalOne-Employee.apk" download><Download size={22}/><span><b>Download Android APK</b><small>Official Global One Employee App</small></span></a>
      <div className="appDownloadSafety"><ShieldCheck size={19}/><span>Secure internal distribution with mandatory in-app updates.</span></div>
    </section>
    <section className="appDownloadSteps">
      <h2>Installation steps</h2>
      <div><CheckCircle2/><span>Download the APK using the button above.</span></div>
      <div><CheckCircle2/><span>Open the downloaded file and allow installation when Android asks.</span></div>
      <div><CheckCircle2/><span>Open Global One and sign in using your registered phone and 4-digit PIN.</span></div>
    </section>
    <footer>Global Birth · Employee application download</footer>
  </main>;
}
