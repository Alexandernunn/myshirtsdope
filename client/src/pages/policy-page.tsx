import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { POLICY_PAGES_BY_PATH, STORE_SUPPORT_EMAIL } from "@shared/store-pages";

export default function PolicyPage() {
  const [location] = useLocation();
  const path = location.replace(/\/+$/, "");
  const page = POLICY_PAGES_BY_PATH.get(path);

  usePageTitle(page?.title ?? "Store Policy");

  if (!page) return null;

  return (
    <div className="min-h-screen">
      <div className="retro-divider" />
      <article className="max-w-3xl mx-auto px-4 py-16">
        <header className="text-center mb-10">
          <p className="font-pixel text-[9px] text-neon-green neon-text-green mb-3 tracking-widest">
            STORE INFO
          </p>
          <h1 className="font-pixel text-lg sm:text-xl text-neon-blue neon-text-blue leading-relaxed">
            {page.title.toUpperCase()}
          </h1>
        </header>

        <div className="space-y-6">
          {page.sections.map((section) => (
            <section key={section.heading} className="bg-card border border-card-border rounded-md p-6 sm:p-8">
              <h2 className="font-pixel text-[10px] text-neon-yellow mb-4">{section.heading.toUpperCase()}</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>
                    {paragraph.split(STORE_SUPPORT_EMAIL).map((part, index, parts) => (
                      <span key={`${part}-${index}`}>
                        {part}
                        {index < parts.length - 1 ? (
                          <a className="text-neon-blue underline underline-offset-4" href={`mailto:${STORE_SUPPORT_EMAIL}`}>
                            {STORE_SUPPORT_EMAIL}
                          </a>
                        ) : null}
                      </span>
                    ))}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc pl-5 space-y-2">
                    {section.bullets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}