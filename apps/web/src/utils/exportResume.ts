import { getAccessToken } from "@/lib/api";

export interface ExperienceSectionItem {
  title?: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets?: string[];
}

export interface EducationSectionItem {
  degree?: string;
  institution?: string;
  year?: string;
}

export interface ResumeSectionContent {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experience?: ExperienceSectionItem[];
  education?: EducationSectionItem[];
  skills?: Array<string | { name: string }>;
  [key: string]: unknown;
}

export function generateAtsResumeHtml(sections: ResumeSectionContent | null | undefined): string {
  const name = sections?.name || "Candidate Name";
  const email = sections?.email || "";
  const phone = sections?.phone || "";
  const location = sections?.location || "";
  const summary = sections?.summary || "";
  const experience: ExperienceSectionItem[] = Array.isArray(sections?.experience)
    ? sections.experience
    : [];
  const education: EducationSectionItem[] = Array.isArray(sections?.education)
    ? sections.education
    : [];
  const skills: Array<string | { name: string }> = Array.isArray(sections?.skills)
    ? sections.skills
    : [];

  const contactLine = [email, phone, location].filter(Boolean).join(" | ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${name} - Tailored Resume</title>
  <style>
    @page { size: letter; margin: 0.75in; }
    body {
      font-family: Arial, Calibri, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #111;
      margin: 0;
      padding: 0.5in;
    }
    h1 { font-size: 18pt; margin: 0 0 4px 0; text-align: center; text-transform: uppercase; }
    .contact { text-align: center; font-size: 10pt; color: #444; margin-bottom: 16px; }
    h2 { font-size: 12pt; border-bottom: 1px solid #333; margin: 14px 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
    p { margin: 4px 0; }
    .job-header { display: flex; justify-content: space-between; font-weight: bold; margin-top: 8px; }
    .job-sub { display: flex; justify-content: space-between; font-style: italic; font-size: 10pt; color: #333; margin-bottom: 4px; }
    ul { margin: 4px 0 10px 18px; padding: 0; }
    li { margin-bottom: 3px; }
    .skills-list { font-size: 10.5pt; }
  </style>
</head>
<body>
  <h1>${name}</h1>
  <div class="contact">${contactLine}</div>

  ${summary ? `<h2>Professional Summary</h2><p>${summary}</p>` : ""}

  ${experience.length > 0 ? `
    <h2>Experience</h2>
    ${experience.map((exp: ExperienceSectionItem) => `
      <div class="job-header">
        <span>${exp.title || "Role"}</span>
        <span>${exp.company || ""}${exp.location ? `, ${exp.location}` : ""}</span>
      </div>
      <div class="job-sub">
        <span>${exp.startDate || ""}${exp.endDate ? ` - ${exp.endDate}` : ""}</span>
      </div>
      ${Array.isArray(exp.bullets) && exp.bullets.length > 0 ? `
        <ul>
          ${exp.bullets.map((b: string) => `<li>${b}</li>`).join("")}
        </ul>
      ` : ""}
    `).join("")}
  ` : ""}

  ${skills.length > 0 ? `
    <h2>Technical Skills</h2>
    <p class="skills-list">
      ${skills.map((s) => typeof s === "string" ? s : s.name).filter(Boolean).join(" • ")}
    </p>
  ` : ""}

  ${education.length > 0 ? `
    <h2>Education</h2>
    ${education.map((edu: EducationSectionItem) => `
      <div class="job-header">
        <span>${edu.degree || "Degree"}</span>
        <span>${edu.institution || ""}${edu.year ? ` (${edu.year})` : ""}</span>
      </div>
    `).join("")}
  ` : ""}
</body>
</html>`;
}

export async function downloadResumeDocx(artifactId: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`/api/artifacts/${artifactId}/export?format=docx`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`DOCX export failed with HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Tailored_Resume.docx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function downloadResumePdf(
  artifactId: string,
  sections?: ResumeSectionContent | null,
): Promise<void> {
  const token = getAccessToken();
  let resumeContent = sections;

  if (!resumeContent) {
    const response = await fetch(`/api/artifacts/${artifactId}/export?format=pdf`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`PDF export failed with HTTP ${response.status}`);
    }

    const json = await response.json();
    resumeContent = json.data?.sections || json.data;
  }

  const html = generateAtsResumeHtml(resumeContent);
  const blob = new Blob([html], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Tailored_Resume.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
