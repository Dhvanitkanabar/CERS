import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Adaption Labs Adaptive Data & AutoScientist Dataset Preparation Script
 * 
 * Generates an anonymized domain-specific JSONL dataset designed for fine-tuning
 * or training evaluations under Adaption Labs' Adaptive Data & AutoScientist.
 * 
 * Features:
 * - 100% de-identified and synthetic data (zero PII)
 * - Multilingual support (English, Hindi, Gujarati scenarios)
 * - Diverse emergency categories (Cardiac, Trauma, Respiratory, Burns, Neurological)
 * - Strict operational schema alignment
 */

const datasetExamples = [
  {
    instruction: "You are the CERS+ Emergency Response Intelligence Engine powered by Adaption Labs. Analyze the reported incident and output a structured operational briefing for dispatchers.",
    input: `EMERGENCY INCIDENT:
Type: Heart Attack
Category: CRITICAL
Location: Majura Gate, Ring Road, Surat, Gujarat
Patient: 58-year-old male
Symptoms: Crushing retrosternal chest pain radiating to left jaw, diaphoresis, dyspnea for 25 minutes.
History: Known CAD, diabetic on metformin. Conscious and talking.
Nearest Hospital: Sunshine Global Hospital (1.2 km away)`,
    output: JSON.stringify({
      summary: "58-year-old male with acute coronary syndrome presentation in Surat. Severe radiating chest pain and diaphoresis with known cardiac history. Patient conscious.",
      extractedInfo: {
        category: "CRITICAL",
        emergencyType: "Heart Attack",
        reportedSymptoms: ["Crushing retrosternal pain", "Radiation to left jaw", "Diaphoresis", "Dyspnea"],
        locationAddress: "Majura Gate, Ring Road, Surat, Gujarat",
        callerName: "Family Member",
        patientCount: "1",
        reportedVitals: "Conscious, dyspneic",
        environmentalHazards: ["Busy traffic intersection"]
      },
      dispatcherBrief: "Dispatch ALS unit equipped with 12-lead ECG, defibrillator, and chewable aspirin. Alert Sunshine Global cath lab for code STEMI preparation.",
      missingInfo: ["Confirm current aspirin ingestion in past 4 hours", "Confirm presence of aspirin/nitroglycerin allergy"],
      operationalConsiderations: [
        "Advise caller to keep patient sitting upright, loosen collar, and avoid all physical exertion",
        "Instruct ambulance driver to use alternate route avoiding Majura flyover congestion"
      ],
      detectedLanguage: "English",
      confidenceScore: 0.98
    })
  },
  {
    instruction: "You are the CERS+ Emergency Response Intelligence Engine powered by Adaption Labs. Analyze the reported incident and output a structured operational briefing for dispatchers.",
    input: `EMERGENCY INCIDENT:
Type: Breathing / Respiratory Distress
Category: CRITICAL
Location: Adajan Patiya, Surat, Gujarat
Patient: 12-year-old female
Symptoms: Severe stridor, wheezing, unable to complete full sentences, blue lips noted by mother.
History: Severe asthma. Inhaler attempted twice without relief.
Nearest Hospital: Unique Hospital (2.0 km)`,
    output: JSON.stringify({
      summary: "12-year-old female experiencing severe acute asthma exacerbation with central cyanosis (blue lips) and refractory to standard inhaler therapy.",
      extractedInfo: {
        category: "CRITICAL",
        emergencyType: "Breathing",
        reportedSymptoms: ["Severe stridor", "Wheezing", "Inability to speak in sentences", "Cyanotic lips"],
        locationAddress: "Adajan Patiya, Surat, Gujarat",
        callerName: "Mother",
        patientCount: "1",
        reportedVitals: "Conscious but hypoxic (cyanotic)",
        environmentalHazards: ["None reported"]
      },
      dispatcherBrief: "Urgent ALS dispatch with pediatric nebulization kit and high-flow oxygen. Priority route with siren.",
      missingInfo: ["Exact pulse oximetry reading if home pulse oximeter available", "Known allergy triggers in environment"],
      operationalConsiderations: [
        "Instruct mother to keep child seated leaning forward (tripod position)",
        "Pre-alert pediatric emergency resuscitation team at receiving hospital"
      ],
      detectedLanguage: "English",
      confidenceScore: 0.97
    })
  },
  {
    instruction: "You are the CERS+ Emergency Response Intelligence Engine powered by Adaption Labs. Analyze the reported incident and output a structured operational briefing for dispatchers.",
    input: `EMERGENCY INCIDENT:
Type: Accident / Poly-Trauma
Category: CRITICAL
Location: Surat-Navsari Highway near Sachin GIDC
Patient: Multiple casualties (commercial tempo vs motorcycle)
Symptoms: Motorcycle driver unconscious with open femur fracture and active bleeding. Pillion conscious with severe abrasions.
Hazards: Diesel fuel spill on asphalt.`,
    output: JSON.stringify({
      summary: "Major two-vehicle collision on Surat-Navsari Highway with two casualties. One critically injured unresponsive patient with active extremity hemorrhage, one conscious stable patient. Fuel hazard present.",
      extractedInfo: {
        category: "CRITICAL",
        emergencyType: "Accident",
        reportedSymptoms: ["Unconsciousness", "Open femur fracture", "Active hemorrhage", "Extensive abrasions"],
        locationAddress: "Surat-Navsari Highway near Sachin GIDC",
        callerName: "Passerby",
        patientCount: "2",
        reportedVitals: "Patient 1: Unresponsive; Patient 2: Conscious",
        environmentalHazards: ["Diesel fuel spill on asphalt", "Active high-speed highway traffic"]
      },
      dispatcherBrief: "Dispatch dual-ambulance trauma response with spine board, traction splint, and tourniquet kits. Immediately notify fire and traffic control regarding fuel spill.",
      missingInfo: ["Check if unresponsive patient has spontaneous breathing", "Determine if fuel spill has ignited"],
      operationalConsiderations: [
        "Instruct bystanders to keep safe distance from fuel slick and divert approaching highway traffic",
        "Prepare designated Level 1 Trauma Center for multi-trauma resuscitation"
      ],
      detectedLanguage: "English",
      confidenceScore: 0.99
    })
  },
  {
    instruction: "You are the CERS+ Emergency Response Intelligence Engine powered by Adaption Labs. Analyze the reported incident and output a structured operational briefing for dispatchers.",
    input: `EMERGENCY INCIDENT:
Type: Stroke / Neurological (FAST)
Category: CRITICAL
Location: Varachha Road, Surat
Patient: 67-year-old female
Symptoms: Sudden onset right-sided facial droop, right arm paralysis, slurred speech (dysarthria). Symptom onset noted exactly 40 minutes ago.
History: Atrial fibrillation on blood thinners.`,
    output: JSON.stringify({
      summary: "67-year-old female presenting with acute acute ischemic stroke symptoms (FAST positive: right hemiplegia, facial droop, dysarthria) within therapeutic thrombolysis window (onset 40 min ago).",
      extractedInfo: {
        category: "CRITICAL",
        emergencyType: "Stroke",
        reportedSymptoms: ["Right-sided facial droop", "Right arm paralysis", "Slurred speech"],
        locationAddress: "Varachha Road, Surat",
        callerName: "Son",
        patientCount: "1",
        reportedVitals: "Conscious, hemiplegic",
        environmentalHazards: ["None reported"]
      },
      dispatcherBrief: "Dispatch ALS unit immediately. Mark as Code Stroke with time-of-onset locked at 40 minutes. Alert receiving comprehensive stroke center for emergency CT angiogram.",
      missingInfo: ["Exact time of last known well state", "Current blood glucose reading if glucometer available"],
      operationalConsiderations: [
        "DO NOT administer any food, fluids, or oral medications (risk of aspiration)",
        "Position patient on side if secretions accumulate; keep head elevated 30 degrees"
      ],
      detectedLanguage: "English",
      confidenceScore: 0.99
    })
  },
  {
    instruction: "You are the CERS+ Emergency Response Intelligence Engine powered by Adaption Labs. Analyze the reported incident and output a structured operational briefing for dispatchers.",
    input: `EMERGENCY INCIDENT (GUJARATI):
Type: Burns / Fire
Category: URGENT
Location: Katargam, Surat
Patient: 35-year-old female
Reported Text: રસોડામાં ગરમ તેલ ઢોળાઈ જવાથી બંને હાથ અને છાતી પર દાઝી ગયા છે. ફોલ્લા પડી ગયા છે. ખૂબ બળતરા થાય છે. દર્દી ભાનમાં છે.`,
    output: JSON.stringify({
      summary: "35-year-old female sustained acute second-degree hot oil burns over bilateral upper extremities and anterior chest in Katargam, Surat. Blisters present with intense pain; patient is fully conscious.",
      extractedInfo: {
        category: "URGENT",
        emergencyType: "Burns",
        reportedSymptoms: ["Hot oil burn wounds", "Blister formation", "Severe acute burning pain"],
        locationAddress: "Katargam, Surat",
        callerName: "Family Member",
        patientCount: "1",
        reportedVitals: "Conscious, in pain",
        environmentalHazards: ["Kitchen burn hazard"]
      },
      dispatcherBrief: "Dispatch BLS/ALS unit with sterile non-adherent burn dressings and analgesia. Pre-alert burn unit.",
      missingInfo: ["Estimated percentage of total body surface area (TBSA) burned", "Any inhalation of smoke or chemical fumes"],
      operationalConsiderations: [
        "Cool burn with cool running tap water for 15-20 minutes; DO NOT apply ice, butter, or home remedies",
        "DO NOT pop or debride blisters; cover loosely with clean cling wrap or sterile drape"
      ],
      detectedLanguage: "Gujarati",
      confidenceScore: 0.96
    })
  },
  {
    instruction: "You are the CERS+ Emergency Response Intelligence Engine powered by Adaption Labs. Analyze the reported incident and output a structured operational briefing for dispatchers.",
    input: `EMERGENCY INCIDENT (HINDI):
Type: Seizure
Category: URGENT
Location: Dindoli, Surat
Patient: 22-year-old male
Reported Text: मरीज को अचानक दौरा पड़ा है, शरीर में कंपन हो रहा है और मुंह से झाग निकल रहा है। दौरा 3 मिनट से चल रहा है। वह बेहોશ है।`,
    output: JSON.stringify({
      summary: "22-year-old male experiencing an active generalized tonic-clonic seizure for 3 minutes with foaming at mouth and loss of consciousness in Dindoli, Surat.",
      extractedInfo: {
        category: "URGENT",
        emergencyType: "Seizure",
        reportedSymptoms: ["Active convulsive tremors", "Foaming at mouth", "Unconsciousness"],
        locationAddress: "Dindoli, Surat",
        callerName: "Brother",
        patientCount: "1",
        reportedVitals: "Unconscious, actively seizing",
        environmentalHazards: ["Potential head impact against hard floor"]
      },
      dispatcherBrief: "Urgent ambulance dispatch. If seizure exceeds 5 minutes, status epilepticus protocol applies. Prepare anticonvulsant and suction.",
      missingInfo: ["History of diagnosed epilepsy or first-time seizure", "Recent head injury or fever"],
      operationalConsiderations: [
        "Instruct caller NEVER to restrain patient or place spoons/objects into mouth",
        "Cushion patient's head with folded towel; roll gently onto side into recovery position once convulsions stop"
      ],
      detectedLanguage: "Hindi",
      confidenceScore: 0.97
    })
  }
];

const exportDataset = () => {
  const outputPath = path.resolve(__dirname, '../data/emergency_response_sft.jsonl');
  const dir = path.dirname(outputPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const jsonlContent = datasetExamples
    .map(example => JSON.stringify(example))
    .join('\n');

  fs.writeFileSync(outputPath, jsonlContent, 'utf-8');
  console.log(`✅ Adaption Labs SFT training dataset generated: ${outputPath}`);
  console.log(`   • Total Records: ${datasetExamples.length}`);
  console.log(`   • Format: JSONL (instruction, input, output schema)`);
  console.log(`   • Target Platforms: Adaption Labs Adaptive Data & AutoScientist`);
};

exportDataset();
