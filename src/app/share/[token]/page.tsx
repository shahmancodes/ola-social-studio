import { notFound } from "next/navigation";
import { projectForShareToken } from "@/lib/platform";
import { SimpleArtifactSchema } from "@/lib/simple-content";
import { DesignSpecSchema } from "@/lib/freeform-design";
export const dynamic = "force-dynamic";

function PreviewHeader({ title, detail }: { title: string; detail?: string }) {
  return <header className="page-heading"><div><p className="page-heading-kicker">Shared preview / Expires in 3 days</p><h1>{title}</h1>{detail && <p className="page-heading-description">{detail}</p>}</div></header>;
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = projectForShareToken(token); if (!row || row.status !== "complete") notFound();
  if (!row.artifact_json) notFound();
  if (row.content_type === "design") {
    const design = DesignSpecSchema.parse(JSON.parse(row.artifact_json));
    return <main className="shell" style={{ maxWidth: 950, paddingBlock: 42 }}><PreviewHeader title={design.title} detail={`${design.size.label} · ${design.size.widthPx} × ${design.size.heightPx} px`} />{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/share/${token}/file`} alt={design.title} style={{ maxWidth: "100%", maxHeight: 700, objectFit: "contain", background: "white" }} /><p><a href={`/api/share/${token}/file?download=1`}>Download PNG</a> · <a href={`/api/share/${token}/file?download=1&format=svg`}>Download editable SVG</a></p></main>;
  }
  const artifact = SimpleArtifactSchema.parse(JSON.parse(row.artifact_json));
  return <main className="shell" style={{ maxWidth: 900, paddingBlock: 42 }}><PreviewHeader title={row.brief} />
    {artifact.type === "post" || artifact.type === "story" || artifact.type === "poster" ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/share/${token}/file`} alt={artifact.type === "story" ? "Instagram Story" : artifact.type === "poster" ? "Poster" : "Post"} style={{ maxWidth: artifact.type === "story" ? 440 : 540, width: "100%" }} />{artifact.type === "post" && <p>{artifact.caption}</p>}</> : artifact.type === "article" ? <article><h2>{artifact.title}</h2>{artifact.sections.map((section, index) => <section key={index}><h3>{section.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{section.body}</p></section>)}</article> : artifact.type === "carousel" ? <div style={{ display: "flex", gap: 18, overflowX: "auto" }}>{artifact.imagePaths.map((_, index) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={index} src={`/api/share/${token}/file?slide=${index + 1}`} alt={`Slide ${index + 1}`} style={{ width: 300, borderRadius: 16 }} />)}</div> : <div>{artifact.slides.map((slide, index) => <section key={index} style={{ background: "#F2EDFF", padding: 32, marginBottom: 18, aspectRatio: "16/9" }}><small>{index + 1}</small><h2>{slide.title}</h2><p>{slide.body}</p></section>)}</div>}
    <p><a href={`/api/share/${token}/file?download=1`}>Download</a> · <a href="/login">Sign in to edit</a></p>
  </main>;
}
