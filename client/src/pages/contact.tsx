import { usePageTitle } from "@/hooks/use-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageSquare } from "lucide-react";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactForm = z.infer<typeof contactSchema>;

export default function Contact() {
  usePageTitle("Contact Us");
  const { toast } = useToast();
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", subject: "", message: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: ContactForm) => {
      await apiRequest("POST", "/api/contact", data);
    },
    onSuccess: () => {
      toast({ title: "MESSAGE SENT", description: "We'll get back to you soon!" });
      form.reset();
    },
    onError: () => {
      toast({ title: "ERROR", description: "Failed to send message. Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen">
      <div className="retro-divider" />

      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <p className="font-pixel text-[9px] text-neon-green neon-text-green mb-3 tracking-widest">
            DIALOGUE BOX
          </p>
          <h1 className="font-pixel text-lg sm:text-xl text-neon-blue neon-text-blue mb-3">
            CONTACT US
          </h1>
          <p className="font-display text-lg text-muted-foreground">
            Questions, custom orders, bulk pricing, or just want to say what's up? Drop us a line.
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-md p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
            <MessageSquare className="w-5 h-5 text-neon-yellow" />
            <span className="font-pixel text-[9px] text-neon-yellow">NEW MESSAGE</span>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-pixel text-[8px] text-muted-foreground">YOUR NAME</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter your name" data-testid="input-contact-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-pixel text-[8px] text-muted-foreground">EMAIL</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="your@email.com" data-testid="input-contact-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-pixel text-[8px] text-muted-foreground">SUBJECT</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="What's this about?" data-testid="input-contact-subject" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-pixel text-[8px] text-muted-foreground">MESSAGE</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Type your message here..."
                        rows={5}
                        className="resize-none"
                        data-testid="input-contact-message"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-send-message"
                className="w-full font-pixel text-[10px] bg-neon-blue border-neon-blue text-white py-5 gap-3 no-default-hover-elevate no-default-active-elevate hover:shadow-[0_0_20px_hsl(200_100%_55%/0.6)] transition-all active:scale-[0.97]"
              >
                <Send className="w-4 h-4" />
                {mutation.isPending ? "SENDING..." : "SEND MESSAGE"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
