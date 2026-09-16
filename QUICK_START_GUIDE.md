# YUVA Fitness - Image Generation Quick Start Guide

## 📋 Your Image Generation Files

You now have three ready-to-use resources:

### 1. **image_gallery_reference.html** (Recommended for Getting Started)
- Open this file in your web browser
- Interactive reference with all 12 images
- Click "Copy Prompt" buttons to easily copy prompts
- View brand colors, specs, and equipment lists
- **Best for:** Visual reference and quick prompt copying

### 2. **IMAGE_GENERATION_PROMPTS.md**
- Plain text markdown format
- All 12 image prompts with detailed descriptions
- Usage instructions for different AI tools
- **Best for:** Text editors, documentation, batch processing

### 3. **image_specs.json**
- Structured JSON format
- Machine-readable specifications
- All technical details in organized format
- **Best for:** Automation, batch processing, programmatic use

---

## 🚀 How to Generate Your Images

### Step 1: Choose Your AI Image Generator
- **Midjourney** (Recommended) - Best cinematic quality and detail
- **DALL-E 3** - Good for architectural shots
- **Stable Diffusion XL** - Alternative open-source option

### Step 2: Generate Each Image
1. Open `image_gallery_reference.html` in your browser
2. Find the image you want to generate
3. Click "Copy Prompt" button
4. Paste into your AI tool
5. Configure settings (see below)
6. Generate

### Step 3: Recommended Settings

**For Midjourney:**
```
/imagine [paste prompt here] --ar 3:4 --q 2 --s 750
```
(Use `--ar 16:9` for images 06, 08, and 12)

**For DALL-E 3:**
- Quality: HD
- Style: Natural
- Size: 1024x1024 (or highest available for your aspect ratio)

**For Stable Diffusion XL:**
- Steps: 50-100
- CFG Scale: 7-15
- Model: SDXL 1.0
- Negative Prompt: "people, text, watermark, signature"

### Step 4: Download & Organize
Save all 12 images in your project:
```
yuva-fitness/
├── assets/
│   ├── images/
│   │   ├── 01-strength-zone.jpg
│   │   ├── 02-machine-zone.jpg
│   │   ├── 03-cardio-zone.jpg
│   │   ├── ... (continue for all 12)
│   │   └── 12-flagship-hero.jpg
```

---

## 🎨 Brand Identity Guidelines

**Colors to Maintain Consistency:**
- Primary Black: #050505
- Dark Surface: #121212
- Accent Red: #E50920
- Off-White: #F5F2EC

**Visual Style Across All Images:**
- Cinematic, professional commercial photography
- Dark interior with subtle red accent lighting
- Photorealistic, high-end gym design
- No people, no text, no watermarks
- Consistent lighting language throughout all 12
- Premium, luxurious aesthetic

---

## 📊 Image Breakdown by Type

### Full Gym Views (16:9 Widescreen)
- **Image 06:** Premium Interior (Entire gym overview)
- **Image 08:** Equipment Detail (Macro close-up)
- **Image 12:** Flagship Hero Shot (Most impressive wide-angle)

### Equipment Zone Focused (3:4 Portrait)
- **Image 01:** Strength Zone (Squat racks)
- **Image 02:** Machine Zone (Resistance machines)
- **Image 03:** Cardio Zone (Treadmills, bikes, etc.)
- **Image 04:** Functional Training (Kettlebells, ropes, etc.)
- **Image 05:** Free Weights (Dumbbell racks)
- **Image 07:** Performance Training (Turf lane with equipment)
- **Image 09:** Cable Machines (Pulley systems)
- **Image 10:** Lower Body Zone (Leg machines)
- **Image 11:** Group Studio (HIIT and class area)

---

## ✅ Quality Checklist Before Using Generated Images

After generating each image, verify:
- ✓ No people visible in image
- ✓ No text or watermarks
- ✓ Dark interior with premium aesthetic
- ✓ Red accent lighting visible
- ✓ Black equipment with realistic finishes
- ✓ Professional, cinematic quality
- ✓ Correct aspect ratio
- ✓ High resolution (at least 2K quality)

---

## 💡 Pro Tips

1. **Batch Generation:** Generate all 12 images in one session if your tool supports it
2. **Consistency Check:** Review all 12 images together to ensure consistent lighting and aesthetic
3. **Regenerate if Needed:** Don't accept mediocre results - regenerate until quality matches the premium standards
4. **Enhancement:** Consider slight edits in Photoshop if needed (color correction, lighting adjustments)
5. **Credit:** Note which AI tool generated each image for your records

---

## 🔧 Troubleshooting

**Images look too bright/dark?**
- Specify "dark interior with subtle lighting" is NOT in prompt - add if needed
- Try different quality settings

**Red lighting not visible enough?**
- Add to prompt: "prominent red accent lighting on equipment edges"
- Increase contrast in generated image

**Equipment not realistic looking?**
- Use higher quality settings
- Regenerate with higher steps/quality
- Try a different AI tool

**Aspect ratio issues?**
- Verify you're specifying correct ratio (3:4 or 16:9)
- For Midjourney, use `--ar` flag
- For DALL-E, select correct dimensions before generating

---

## 📞 Support Resources

- Midjourney Help: https://docs.midjourney.com
- DALL-E Docs: https://openai.com/dall-e-3
- Stable Diffusion: https://stability.ai

---

**Generated:** 2026-09-09  
**Project:** YUVA Premium Fitness Photography  
**Status:** Ready for image generation
