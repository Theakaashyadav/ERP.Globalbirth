export default function PageHeader({ icon: Icon, title, subtitle, tone = "blue", action }) {
  return (
    <header className={"pageHeader " + tone}>
      <div>
        <h1>{Icon && <Icon size={34} />} {title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
