import asyncio
import json
import logging
import time
from app.services.file_validator import validate_resume_file
from app.services.text_extractor import extract_resume_text
from app.services.section_segmenter import segment_resume_sections, format_segmented_chunks
from app.llm.security import wrap_untrusted
from app.agents.resume_parser import RESUME_EXTRACTION_PROMPT
from app.llm.client import LLMClient
from app.schemas.profile import ParsedProfile
from app.services.normalizer import post_process_parsed_profile

logging.basicConfig(level=logging.INFO)

async def main():
    print("=== STEP 1: READ FILE ===")
    with open("/tmp/my_resume.pdf", "rb") as f:
        content = f.read()
    print(f"File size: {len(content)} bytes")
    
    file_type = validate_resume_file(content, "my_resume.pdf")
    print(f"Validated file type: {file_type}")
    
    print("\n=== STEP 2: TEXT EXTRACTION ===")
    extraction = extract_resume_text(content, file_type)
    raw_text = extraction.text.strip()
    print(f"Extracted raw text length: {len(raw_text)} chars")
    print(f"Pages extracted: {extraction.pages_extracted}")
    print(f"OCR used: {extraction.ocr_used}")
    print(f"Extraction warnings: {extraction.warnings}")
    
    print("\n=== STEP 3: SECTION SEGMENTATION ===")
    sections = segment_resume_sections(raw_text)
    print(f"Number of sections detected: {len(sections)}")
    for sec_name, sec_text in sections.items():
        print(f"  Section '{sec_name}': {len(sec_text)} chars, {len(sec_text.splitlines())} lines")
    
    formatted_chunks = format_segmented_chunks(sections)
    print(f"Formatted chunks length: {len(formatted_chunks)} chars")
    
    print("\n=== STEP 4: WRAP UNTRUSTED PAYLOAD ===")
    untrusted_payload = wrap_untrusted(
        label="candidate_resume",
        text=formatted_chunks,
        max_chars=15000,
    )
    print(f"Untrusted payload length: {len(untrusted_payload)} chars")
    
    print("\n=== STEP 5: LLM INVOCATION & STRUCTURED OUTPUT ===")
    client = LLMClient()
    rendered_prompt = RESUME_EXTRACTION_PROMPT.format(segmented_resume_data=untrusted_payload)
    print(f"Rendered prompt length: {len(rendered_prompt)} chars")
    print(f"Provider order: {client.provider_order}")
    for p_name, prov in client._providers.items():
        print(f"  Provider '{p_name}': model='{prov.model_name}'")
        
    start_time = time.perf_counter()
    try:
        llm_output = await client.generate_structured(
            prompt_template=RESUME_EXTRACTION_PROMPT,
            variables={"segmented_resume_data": untrusted_payload},
            output_model=ParsedProfile,
            temperature=0.0,
            task_name="resume_parser_diagnose",
        )
        duration = time.perf_counter() - start_time
        print(f"LLM call succeeded in {duration:.2f}s")
        print("\n--- LLM RAW STRUCTURED OUTPUT (summary of fields) ---")
        llm_dict = llm_output.model_dump()
        print(f"Name: {llm_dict.get('name')}")
        print(f"Email: {llm_dict.get('email')}")
        print(f"Phone: {llm_dict.get('phone')}")
        print(f"Location: {llm_dict.get('location')}")
        print(f"Links count: {len(llm_dict.get('links', []))}")
        print(f"Summary length: {len(llm_dict.get('summary', ''))}")
        print(f"Skills count: {len(llm_dict.get('skills', []))}")
        print(f"Experience count: {len(llm_dict.get('experience', []))}")
        print(f"Education count: {len(llm_dict.get('education', []))}")
        print(f"Projects count: {len(llm_dict.get('projects', []))}")
        print(f"Certifications count: {len(llm_dict.get('certifications', []))}")
        print(f"Languages count: {len(llm_dict.get('languages', []))}")
        
        print("\n=== STEP 6: POST-PROCESSING (NORMALIZER) ===")
        processed = post_process_parsed_profile(llm_output, raw_text)
        proc_dict = processed.model_dump()
        print(f"Post-processed Skills count: {len(proc_dict.get('skills', []))}")
        print(f"Post-processed Experience count: {len(proc_dict.get('experience', []))}")
        print(f"Post-processed Education count: {len(proc_dict.get('education', []))}")
        print(f"Post-processed Projects count: {len(proc_dict.get('projects', []))}")
        print(f"Post-processed Field Confidences: {proc_dict.get('field_confidence')}")
        
        if len(proc_dict.get('experience', [])) == 0:
            print("\n!!! WARNING: Experience count is 0! Inspecting raw LLM experience dump:")
            print(json.dumps(llm_dict.get('experience'), indent=2))
        if len(proc_dict.get('education', [])) == 0:
            print("\n!!! WARNING: Education count is 0! Inspecting raw LLM education dump:")
            print(json.dumps(llm_dict.get('education'), indent=2))
        if len(proc_dict.get('projects', [])) == 0:
            print("\n!!! WARNING: Projects count is 0! Inspecting raw LLM projects dump:")
            print(json.dumps(llm_dict.get('projects'), indent=2))
            
    except Exception as e:
        print(f"LLM execution failed: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
