import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetProfile,
  useCreateProfile,
  useUpdateProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const profileSchema = z.object({
  name: z.string().min(1, "Your name is required"),
  hasKids: z.boolean(),
  numberOfKids: z.coerce.number().optional(),
  workSchedule: z.string().optional(),
  healthConditions: z.string().optional(),
  averageSleepHours: z.coerce.number().min(0).max(24).optional(),
  cycleLength: z.coerce.number().min(21).max(45).optional(),
  periodLength: z.coerce.number().min(1).max(10).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: profile, isLoading } = useGetProfile();
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      hasKids: false,
      numberOfKids: undefined,
      workSchedule: "",
      healthConditions: "",
      averageSleepHours: 7,
      cycleLength: 28,
      periodLength: 5,
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name,
        hasKids: profile.hasKids,
        numberOfKids: profile.numberOfKids ?? undefined,
        workSchedule: profile.workSchedule ?? "",
        healthConditions: profile.healthConditions ?? "",
        averageSleepHours: profile.averageSleepHours ?? 7,
        cycleLength: profile.cycleLength ?? 28,
        periodLength: profile.periodLength ?? 5,
      });
    }
  }, [profile, form]);

  const onSubmit = (data: ProfileFormData) => {
    const payload = {
      name: data.name,
      hasKids: data.hasKids,
      numberOfKids: data.hasKids ? data.numberOfKids ?? null : null,
      workSchedule: data.workSchedule || null,
      healthConditions: data.healthConditions || null,
      averageSleepHours: data.averageSleepHours ?? null,
      cycleLength: data.cycleLength ?? null,
      periodLength: data.periodLength ?? null,
    };

    if (profile) {
      updateProfile.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
          },
        }
      );
    } else {
      createProfile.mutate(
        { data: { ...payload, hasKids: payload.hasKids } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
            setLocation("/");
          },
        }
      );
    }
  };

  const hasKids = form.watch("hasKids");
  const isOnboarding = !profile && !isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <header className="px-5 pt-10 pb-6">
        {isOnboarding && (
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-serif">Welcome!</h1>
              <p className="text-sm text-muted-foreground">Let's personalize your experience</p>
            </div>
          </div>
        )}
        {!isOnboarding && (
          <>
            <h1 className="text-2xl font-serif">Profile</h1>
            <p className="text-sm text-muted-foreground">Your personal settings</p>
          </>
        )}
      </header>

      <div className="flex-1 px-5 pb-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Your name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Sofia"
                      data-testid="input-name"
                      className="rounded-xl border-border bg-card"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Kids */}
            <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
              <FormField
                control={form.control}
                name="hasKids"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <div>
                        <FormLabel className="text-sm font-medium">Do you have children?</FormLabel>
                        <p className="text-xs text-muted-foreground">Helps plan around school & family</p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-has-kids"
                        />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />
              {hasKids && (
                <FormField
                  control={form.control}
                  name="numberOfKids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">How many?</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          max={10}
                          placeholder="2"
                          data-testid="input-number-of-kids"
                          className="rounded-xl border-border bg-accent w-24"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Work */}
            <FormField
              control={form.control}
              name="workSchedule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Work schedule</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-xl border-border bg-card" data-testid="select-work-schedule">
                        <SelectValue placeholder="Select your schedule" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="9am-5pm Mon-Fri">9am–5pm, Mon–Fri</SelectItem>
                      <SelectItem value="flexible">Flexible / Remote</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="shifts">Shift work</SelectItem>
                      <SelectItem value="stay-at-home">Stay at home</SelectItem>
                      <SelectItem value="freelance">Freelance</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Health */}
            <FormField
              control={form.control}
              name="healthConditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Health conditions</FormLabel>
                  <p className="text-xs text-muted-foreground -mt-1">e.g. PCOS, endometriosis, thyroid, anxiety</p>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Optional — helps personalize advice"
                      data-testid="input-health-conditions"
                      className="rounded-xl border-border bg-card"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sleep */}
            <FormField
              control={form.control}
              name="averageSleepHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Average sleep hours</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={3}
                      max={12}
                      step={0.5}
                      placeholder="7"
                      data-testid="input-sleep-hours"
                      className="rounded-xl border-border bg-card"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cycle length */}
            <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
              <h3 className="text-sm font-medium">Cycle settings</h3>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="cycleLength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Cycle length (days)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={21}
                          max={45}
                          placeholder="28"
                          data-testid="input-cycle-length"
                          className="rounded-xl border-border bg-accent"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="periodLength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Period length (days)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          max={10}
                          placeholder="5"
                          data-testid="input-period-length"
                          className="rounded-xl border-border bg-accent"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Button
              type="submit"
              data-testid="btn-save-profile"
              disabled={createProfile.isPending || updateProfile.isPending}
              className="w-full rounded-xl py-3 text-sm font-medium"
            >
              {createProfile.isPending || updateProfile.isPending
                ? "Saving..."
                : isOnboarding
                ? "Let's get started"
                : "Save changes"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
