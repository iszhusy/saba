interface PageHeroProps {
  protocol: string;
  title: string;
  description: string;
  variant: 'history' | 'profile';
}

export function PageHero({ protocol, title, description, variant }: PageHeroProps) {
  return (
    <header className={`saba-page-hero saba-page-hero--${variant}`}>
      <span className="saba-page-hero__grid" aria-hidden />
      <span className="saba-page-hero__wave" aria-hidden />
      <p className="saba-page-hero__protocol">{protocol}</p>
      <h2 className="saba-page-hero__title">{title}</h2>
      <p className="saba-page-hero__desc">{description}</p>
      <ol className="saba-care-path" aria-label="评估流程">
        <li className="saba-care-path__step saba-care-path__step--done">
          <span>采集</span>
        </li>
        <li className="saba-care-path__step saba-care-path__step--done">
          <span>分析</span>
        </li>
        <li className="saba-care-path__step">
          <span>建议</span>
        </li>
      </ol>
    </header>
  );
}
