import Starfield from "@/components/starfield";
import { usePageTitle } from "@/hooks/use-page-title";

export default function About() {
  usePageTitle("Our Story");

  return (
    <div className="min-h-screen">
      <div className="retro-divider" />

      <section className="relative py-20 px-4 overflow-hidden pixel-grid-bg">
        <Starfield />
        <div className="scanline-overlay opacity-20" />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <p className="font-pixel text-[9px] text-neon-green neon-text-green mb-4 tracking-widest">
            STORY MODE
          </p>
          <h1 className="font-pixel text-xl sm:text-2xl text-neon-blue neon-text-blue mb-8 leading-relaxed">
            OUR STORY
          </h1>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-16 space-y-12">
        <div className="bg-card border border-card-border rounded-md p-6 sm:p-8">
          <h2 className="font-pixel text-[10px] text-neon-yellow neon-text-yellow mb-4">THE MISSION</h2>
          <p className="font-display text-lg text-foreground leading-relaxed mb-4">
            MyShirtsDope was born from a simple idea: culture should be worn, shared, and celebrated.
            We create wearable art that represents the times, feelings, events, places, songs, and artists
            that shaped who we are.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Every piece in our collection tells a story. From old school hip hop to classic R&B,
            from soul to pop, from love to the moments that define us - we turn culture into
            something you can wear with pride.
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-md p-6 sm:p-8">
          <h2 className="font-pixel text-[10px] text-neon-green neon-text-green mb-4">THE VIBE</h2>
          <p className="font-display text-lg text-foreground leading-relaxed mb-4">
            We are nostalgic. We are bold. We are community-driven. We believe the best music, the best
            art, and the best culture deserve to be remembered and repped every single day.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Our designs are inspired by the mixtapes that got passed around on the bus, the album
            covers that became icons, the concerts that changed lives, and the love songs that
            became anthems. If you feel it, you can wear it.
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-md p-6 sm:p-8">
          <h2 className="font-pixel text-[10px] text-neon-orange neon-text-orange mb-4">THE PROMISE</h2>
          <p className="font-display text-lg text-foreground leading-relaxed mb-4">
            Every product we make is unique. You won't find these designs anywhere else.
            We create shirts, hoodies, onesies, and accessories for all ages - because
            culture has no age limit.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            From the littlest fans rocking onesies inspired by classic tracks to adults
            wearing hoodies that spark conversations, MyShirtsDope is for everyone who
            believes that the best music and moments deserve to live on.
          </p>
        </div>

        <div className="text-center py-8">
          <p className="font-pixel text-[10px] text-neon-blue neon-text-blue animate-neon-pulse">
            CULTURE NEVER DIES
          </p>
        </div>
      </div>
    </div>
  );
}
