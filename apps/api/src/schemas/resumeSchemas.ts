import { z } from "zod";

export const profileSkillSchema = z.object({
  name: z.string().min(1, "Skill name is required"),
  category: z.string().default("General"),
  years: z.number().nullable().optional(),
  evidence: z.string().nullable().optional(),
});

export const workExperienceSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  title: z.string().min(1, "Job title is required"),
  start: z.string().nullable().optional(),
  end: z.string().nullable().optional(),
  bullets: z.array(z.string()).optional().default([]),
});

export const educationSchema = z.object({
  institution: z.string().min(1, "Institution name is required"),
  degree: z.string().min(1, "Degree is required"),
  field_of_study: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  gpa: z.string().nullable().optional(),
});

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().default(""),
  technologies: z.array(z.string()).optional().default([]),
  link: z.string().nullable().optional(),
});

export const certificationSchema = z.object({
  name: z.string().min(1, "Certification name is required"),
  issuer: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

export const languageProficiencySchema = z.object({
  language: z.string().min(1, "Language is required"),
  proficiency: z.string().default("fluent"),
});

export const parsedProfileSchema = z.object({
  name: z.string().min(1, "Candidate name is required"),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  links: z.array(z.string()).optional().default([]),
  summary: z.string().default(""),
  skills: z.array(profileSkillSchema).optional().default([]),
  experience: z.array(workExperienceSchema).optional().default([]),
  education: z.array(educationSchema).optional().default([]),
  projects: z.array(projectSchema).optional().default([]),
  certifications: z.array(certificationSchema).optional().default([]),
  languages: z.array(languageProficiencySchema).optional().default([]),
  field_confidence: z.record(z.number()).optional().default({}),
  raw_text: z.string().nullable().optional(),
});

export const patchProfileSchema = parsedProfileSchema;

export type ParsedProfileInput = z.infer<typeof parsedProfileSchema>;
