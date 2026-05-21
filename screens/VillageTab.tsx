import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useColors, Colors } from '../lib/theme';

import { Village, VILLAGES, CHILD_AGES, DUE_DATE_MONTHS, toVillageId, COUNTRIES, STATES_BY_COUNTRY, CITIES_BY_STATE } from '../lib/villageData';
import VillageFeedSheet from './VillageFeedSheet';


// ─── Quiz questions ───────────────────────────────────────────────────────────
// TODO: Replace with the final question list once confirmed

type QuizQuestion = {
  id: string;
  question: string;
  multi: boolean;
  options: string[];
  type?: 'location';
  skipIf?: (answers: Record<string, string[]>) => boolean;
  hasRequestButton?: boolean;
};

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'born_or_expecting',
    question: 'Do you have children already, or are you expecting?',
    multi: false,
    options: ['My child(ren) are here', "We're expecting", 'Planning / Trying to Conceive (TTC)'],
  },
  {
    id: 'ttc_journey',
    question: 'What best describes your TTC journey? (Select all that apply)',
    multi: true,
    options: [
      'Just starting out',
      'Been trying for 6–12 months',
      'Long journey — trying for 1+ year',
      'Dealing with infertility',
      'PCOS or hormonal condition',
      'Unexplained infertility',
      'Secondary infertility (already have a child)',
      'Currently in fertility treatments (IVF, IUI, etc.)',
      'TTC after a pregnancy loss',
      'LGBTQ+ family building',
      'Prefer not to say',
    ],
    hasRequestButton: true,
    skipIf: (answers) => answers['born_or_expecting']?.[0] !== 'Planning / Trying to Conceive (TTC)',
  },
  {
    id: 'due_date',
    question: 'When is your due date?',
    multi: false,
    options: DUE_DATE_MONTHS,
    skipIf: (answers) => answers['born_or_expecting']?.[0] !== "We're expecting",
  },
  {
    id: 'num_kids',
    question: 'How many children do you have?',
    multi: false,
    options: ['0 / None yet', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'I have more'],
  },
  {
    id: 'family_planning',
    question: 'Are you planning to have more children?',
    multi: false,
    options: [
      'Yes — we want more children',
      "No — we're one and done",
      'No — our family feels complete',
      'Not sure yet / Open to it',
      'Prefer not to say',
    ],
    skipIf: (answers) => answers['born_or_expecting']?.[0] === 'Planning / Trying to Conceive (TTC)',
  },
  {
    id: 'gender',
    question: 'Do you have a girl or boy?',
    multi: true,
    options: ['Girl', 'Boy', 'Other', 'None yet / Not applicable'],
  },
  {
    id: 'gender_identity',
    question: 'How does your child identify?',
    multi: true,
    options: [
      'Non-binary',
      'Transgender Boy (FTM)',
      'Transgender Girl (MTF)',
      'Gender fluid',
      'Questioning / Exploring',
      'Prefer not to say',
    ],
    skipIf: (answers) => !(answers['gender'] ?? []).includes('Other'),
  },
  {
    id: 'multiples',
    question: 'Are any of your children multiples?',
    multi: true,
    options: ['No', 'Twins', 'Triplets', 'Quadruplets', 'Quintuplets', 'I have more'],
  },
  {
    id: 'twins_type',
    question: 'What type of twins do you have? (Select all that apply)',
    multi: true,
    options: ['Identical Twins', 'Fraternal Twins', 'Multiple sets of twins', 'Not sure / Unknown'],
    skipIf: (answers) => !(answers['multiples'] ?? []).includes('Twins'),
  },
  {
    id: 'child_age',
    question: 'How old are your children?',
    multi: true,
    options: CHILD_AGES.map(a => a.label),
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'parent_status',
    question: 'What is your parent status?',
    multi: true,
    options: [
      'Biological Parent',
      'Adoptive Parent',
      'Step-parent',
      'Foster Parent',
    ],
  },
  {
    id: 'familial_situation',
    question: 'Is this a familial foster or adoption situation?',
    multi: true,
    options: [
      'Grandparent raising grandchild(ren)',
      'Aunt / Uncle raising nieces/nephews',
      'Other family member (cousin, sibling, etc.)',
      'Not a familial situation',
    ],
    skipIf: (answers) => {
      const status = answers['parent_status'] ?? [];
      return !status.includes('Foster Parent') && !status.includes('Adoptive Parent');
    },
  },
  {
    id: 'single_parent',
    question: 'Does any of this describe your family situation?',
    multi: true,
    options: [
      'Single Mom by Choice',
      'Single Dad by Choice',
      'Single Mom by Circumstance',
      'Single Dad by Circumstance',
      'Single Mom — Widowed / Loss',
      'Single Dad — Widowed / Loss',
      'Co-parenting',
      'None of these',
    ],
    hasRequestButton: true,
  },
  {
    id: 'lgbtq_family',
    question: 'Do any of these describe your family?',
    multi: true,
    options: [
      'Gay Dads',
      'Lesbian Moms',
      'Queer / Non-Binary Parent(s)',
      'Same-sex couple',
      'Transgender Parent',
      'None of these',
    ],
    hasRequestButton: true,
  },
  {
    id: 'military_family',
    question: 'Is your family connected to the military?',
    multi: true,
    options: [
      'Military Mom (Active Duty)',
      'Military Dad (Active Duty)',
      'Spouse / Partner of Military Member',
      'Veteran Parent',
      'National Guard / Reserve Parent',
      'None of these',
    ],
  },
  {
    id: 'fertility_treatments',
    question: 'Did you use any fertility treatments?',
    multi: true,
    options: [
      'IVF',
      'IUI',
      'Donor Egg / Sperm',
      'Embryo Donation',
      'Surrogacy',
      'No fertility treatments',
    ],
  },
  {
    id: 'parent_age_range',
    question: 'How old are you?',
    multi: false,
    options: [
      'Under 20',
      '20–24',
      '25–29',
      '30–34',
      '35–39',
      '40–44',
      '45+',
      'Prefer not to say',
    ],
  },
  {
    id: 'loss_parent',
    question: 'Have you experienced the loss of a child or pregnancy?',
    multi: false,
    options: ['Yes', 'No', "I'd rather not say"],
  },
  {
    id: 'loss_type',
    question: 'How did you experience this loss? (Select all that apply)',
    multi: true,
    options: [
      'Miscarriage (1st trimester)',
      'Miscarriage (2nd trimester)',
      'Ectopic or molar pregnancy',
      'TFMR (Termination for Medical Reasons)',
      'Stillbirth (20+ weeks)',
      'Loss shortly after birth (NICU / prematurity complications)',
      'SIDS (Sudden Infant Death Syndrome)',
      'SUDC (Sudden Unexplained Death in Childhood)',
      'SADS (Sudden Arrhythmia Death Syndrome)',
      'Illness or medical condition',
      'Pediatric cancer',
      'Accident or injury',
      "I'd rather not say",
    ],
    hasRequestButton: true,
    skipIf: (answers) => answers['loss_parent']?.[0] !== 'Yes',
  },
  {
    id: 'gestational_age',
    question: 'What was your child\'s gestational age at birth?',
    multi: false,
    options: [
      'Under 22 weeks (Periviable)',
      '22–24 weeks (Extreme Prematurity)',
      '25–32 weeks (Moderate Prematurity)',
      '33–36 weeks (Late Preterm)',
      '37+ weeks / Full term',
    ],
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'nicu_experience',
    question: 'Did your child spend time in the NICU?',
    multi: false,
    options: ['Yes — they were in the NICU', 'No', 'Prefer not to say'],
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'birth_type',
    question: 'What type of birth did you have / are you planning? (Select all that apply)',
    multi: true,
    options: [
      'Vaginal birth',
      'Unmedicated / natural birth',
      'Planned C-section',
      'Emergency C-section',
      'VBAC (Vaginal Birth After Cesarean)',
      'Home birth',
      'Birth center birth',
      'Water birth',
      'Induced labor',
      'Assisted delivery (forceps or vacuum)',
      'Experienced birth trauma',
      'Still planning / not yet decided',
      'Prefer not to say',
    ],
    hasRequestButton: true,
    skipIf: (answers) =>
      answers['born_or_expecting']?.[0] === 'Planning / Trying to Conceive (TTC)' &&
      (answers['num_kids']?.[0] === '0 / None yet' || !answers['num_kids']?.[0]),
  },
  {
    id: 'birth_csection_detail',
    question: 'Tell us more about your C-section experience:',
    multi: true,
    options: [
      'Planned due to medical recommendation (breech, placenta previa, etc.)',
      'Planned by personal choice',
      'Emergency due to fetal distress',
      'Emergency due to failure to progress',
      'Emergency due to placenta complications',
      'Emergency due to cord prolapse or other emergency',
      'Repeat C-section (not my first)',
      'Difficult recovery',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const b = answers['birth_type'] ?? [];
      return !b.includes('Planned C-section') && !b.includes('Emergency C-section');
    },
  },
  {
    id: 'birth_vbac_detail',
    question: 'Tell us more about your VBAC:',
    multi: true,
    options: [
      'Successful VBAC — vaginal birth achieved',
      'Attempted VBAC that ended in C-section',
      'Planning a VBAC for an upcoming birth',
      'VBAC after 1 C-section',
      'VBAC after 2 or more C-sections',
    ],
    skipIf: (answers) => !(answers['birth_type'] ?? []).includes('VBAC (Vaginal Birth After Cesarean)'),
  },
  {
    id: 'birth_trauma_detail',
    question: 'What best describes your birth trauma experience? (Select all that apply)',
    multi: true,
    options: [
      'Traumatic emergency C-section',
      'Postpartum hemorrhage',
      'Medical emergency during or after delivery',
      'Baby transferred to NICU immediately after birth',
      'Feeling unheard or unsupported during labor',
      'Loss of my planned birth experience',
      'Birth-related PTSD or anxiety',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const b = answers['birth_type'] ?? [];
      return !b.includes('Emergency C-section') && !b.includes('Experienced birth trauma');
    },
  },
  {
    id: 'neuro_dev',
    question: 'Does your child have any neurodevelopmental differences?',
    multi: true,
    options: [
      'Autism Level 1',
      'Autism Level 2',
      'Autism Level 3',
      'ADHD',
      'Learning Disability',
      'Sensory Processing Differences',
      'None / Not applicable',
    ],
    hasRequestButton: true,
  },
  {
    id: 'autism_l1_girl_type',
    question: 'How was your child\'s Autism Level 1 identified?',
    multi: false,
    options: ['Standard Diagnosis', 'Late / Missed Diagnosis'],
    skipIf: (answers) =>
      !(answers['neuro_dev'] ?? []).includes('Autism Level 1'),
  },
  {
    id: 'adhd_type',
    question: 'Which type of ADHD does your child have?',
    multi: false,
    options: [
      'Inattentive Type (ADD)',
      'Hyperactive-Impulsive Type',
      'Combined Type',
      'Awaiting / Unsure of Diagnosis',
    ],
    skipIf: (answers) => !(answers['neuro_dev'] ?? []).includes('ADHD'),
  },
  {
    id: 'learning_disability_type',
    question: 'Which learning disability does your child have?',
    multi: true,
    options: [
      'Dyslexia',
      'Dyscalculia',
      'Dysgraphia',
      'Dyspraxia / Developmental Coordination Disorder',
      'Auditory Processing Disorder',
      'Nonverbal Learning Disability (NVLD)',
      'Other Learning Disability',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['neuro_dev'] ?? []).includes('Learning Disability'),
  },
  {
    id: 'spd_type',
    question: 'Which sensory differences does your child experience?',
    multi: true,
    options: [
      'Tactile sensitivity (touch / textures)',
      'Auditory sensitivity (sounds)',
      'Visual sensitivity (light / motion)',
      'Oral / gustatory sensitivity (taste / food textures)',
      'Olfactory sensitivity (smells)',
      'Proprioceptive differences (body awareness / pressure)',
      'Vestibular differences (balance / movement)',
      'Interoceptive differences (internal body sensations)',
      'Sensory seeking',
      'Sensory avoidance',
      'Mixed / multiple sensory differences',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['neuro_dev'] ?? []).includes('Sensory Processing Differences'),
  },
  {
    id: 'medical_diagnosis',
    question: 'Does your child have any of the following medical diagnoses?',
    multi: true,
    options: [
      'Down Syndrome',
      'Cerebral Palsy',
      'Congenital Heart Defect',
      'Genetic / Chromosomal Condition',
      'Premature Birth',
      'Pediatric Cancer',
      'Kidney / Urological Condition',
      'Craniosynostosis',
      'Other Medical Condition',
      'None of these',
    ],
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'ds_subtype',
    question: 'Which type of Down Syndrome does your child have?',
    multi: true,
    options: ['Trisomy 21 (Standard)', 'Translocation', 'Mosaic', 'Dual Diagnosis'],
    skipIf: (answers) => !(answers['medical_diagnosis'] ?? []).includes('Down Syndrome'),
  },
  {
    id: 'cp_subtype',
    question: 'Which type of Cerebral Palsy does your child have?',
    multi: true,
    options: [
      'Hemiplegia — Left Side',
      'Hemiplegia — Right Side',
      'Diplegia',
      'Quadriplegia',
      'Ataxic CP',
      'Dyskinetic / Athetoid CP',
    ],
    skipIf: (answers) => !(answers['medical_diagnosis'] ?? []).includes('Cerebral Palsy'),
  },
  {
    id: 'chd_type',
    question: 'Which type of congenital heart defect does your child have?',
    multi: true,
    options: [
      'HLHS (Hypoplastic Left Heart Syndrome)',
      'Tetralogy of Fallot',
      'Transposition of the Great Arteries (TGA)',
      'Ventricular Septal Defect (VSD)',
      'Atrial Septal Defect (ASD)',
      'Coarctation of the Aorta',
      'Pulmonary Atresia',
      'AVSD (Atrioventricular Septal Defect)',
      'Other Congenital Heart Defect',
    ],
    skipIf: (answers) => !(answers['medical_diagnosis'] ?? []).includes('Congenital Heart Defect'),
  },
  {
    id: 'genetic_condition',
    question: 'Which genetic or chromosomal condition does your child have?',
    multi: true,
    options: [
      'Fragile X Syndrome',
      'Rett Syndrome',
      'Prader-Willi Syndrome',
      'Angelman Syndrome',
      'Tuberous Sclerosis Complex',
      '22q11.2 Deletion / DiGeorge Syndrome',
      'Williams Syndrome',
      'Ehlers-Danlos Syndrome (EDS)',
      'CHARGE Syndrome',
      'Other Genetic / Chromosomal Condition',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['medical_diagnosis'] ?? []).includes('Genetic / Chromosomal Condition'),
  },
  {
    id: 'other_medical_condition',
    question: 'Which medical condition does your child have?',
    multi: true,
    options: [
      'Spina Bifida',
      'Hydrocephalus',
      'Epilepsy / Seizure Disorder',
      'Type 1 Diabetes',
      'Cystic Fibrosis',
      'Spinal Muscular Atrophy (SMA)',
      'Muscular Dystrophy',
      'Sickle Cell Disease',
      'Cleft Lip / Palate',
      'Osteogenesis Imperfecta',
      'Esophageal Atresia / Tracheoesophageal Fistula (TEF)',
      'Gastroschisis / Omphalocele',
      "Hirschsprung's Disease",
      'Biliary Atresia',
      'Short Bowel Syndrome',
      'Scoliosis',
      'Hip Dysplasia (DDH)',
      'Other',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['medical_diagnosis'] ?? []).includes('Other Medical Condition'),
  },
  {
    id: 'pediatric_cancer_type',
    question: 'What type of cancer does / did your child have?',
    multi: true,
    options: [
      'Leukemia (ALL or AML)',
      'Brain tumor',
      'Lymphoma',
      'Neuroblastoma',
      "Wilms tumor (kidney)",
      'Bone cancer (Osteosarcoma or Ewing Sarcoma)',
      'Soft tissue sarcoma (Rhabdomyosarcoma, etc.)',
      'Retinoblastoma',
      'Liver tumor (Hepatoblastoma)',
      'Childhood cancer survivor',
      'Other pediatric cancer',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['medical_diagnosis'] ?? []).includes('Pediatric Cancer'),
  },
  {
    id: 'kidney_condition_type',
    question: "What best describes your child's kidney or urological condition?",
    multi: true,
    options: [
      'Hydronephrosis',
      'Vesicoureteral Reflux (VUR)',
      'Polycystic Kidney Disease (PKD)',
      'Nephrotic Syndrome',
      'Chronic Kidney Disease (CKD)',
      'Kidney transplant',
      'Posterior Urethral Valves (PUV)',
      'Other kidney / urological condition',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['medical_diagnosis'] ?? []).includes('Kidney / Urological Condition'),
  },
  {
    id: 'medical_equipment',
    question: 'Does your child use any medical equipment?',
    multi: true,
    options: [
      'Feeding tube (G-tube, NG-tube, GJ-tube, etc.)',
      'Wheelchair or power chair',
      'Gait trainer / adaptive walker',
      'Hearing aids',
      'Cochlear implant',
      'Tracheostomy (trach)',
      'Oxygen / respiratory support',
      'Communication device (AAC / speech-generating device)',
      'Insulin pump or CGM (continuous glucose monitor)',
      'Orthotics / AFOs / leg braces / prosthetics',
      'CPAP / BiPAP',
      'None of these',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'equipment_wheelchair_detail',
    question: 'What type of mobility equipment does your child use?',
    multi: true,
    options: [
      'Manual wheelchair',
      'Power wheelchair / power chair',
      'Gait trainer / pediatric walker',
      'Stander / standing frame',
      'Uses multiple mobility devices',
    ],
    skipIf: (answers) => {
      const e = answers['medical_equipment'] ?? [];
      return !e.includes('Wheelchair or power chair') && !e.includes('Gait trainer / adaptive walker');
    },
  },
  {
    id: 'equipment_hearing_detail',
    question: "What best describes your child's hearing situation?",
    multi: true,
    options: [
      'Hearing aids (mild to moderate hearing loss)',
      'Cochlear implant — one ear',
      'Bilateral cochlear implants — both ears',
      'Bone anchored hearing aid (BAHA / Osia)',
      'Profound deafness — no amplification device',
      'Hard of hearing — navigating without devices',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const e = answers['medical_equipment'] ?? [];
      return !e.includes('Hearing aids') && !e.includes('Cochlear implant');
    },
  },
  {
    id: 'equipment_oxygen_detail',
    question: "What does your child's respiratory support look like?",
    multi: true,
    options: [
      'Home oxygen — continuous use',
      'Oxygen during sleep or activity only',
      'High-flow nasal cannula',
      'Tracheostomy (trach) — with or without vent',
      'Ventilator (vent) dependent',
      'Pulse oximetry monitoring only',
    ],
    skipIf: (answers) => {
      const e = answers['medical_equipment'] ?? [];
      return !e.includes('Oxygen / respiratory support') && !e.includes('Tracheostomy (trach)');
    },
  },
  {
    id: 'child_surgery',
    question: 'Has your child had surgery?',
    multi: true,
    options: [
      'Yes — already had surgery',
      'Surgery scheduled / upcoming',
      'No',
      'Prefer not to say',
    ],
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'child_surgery_type',
    question: 'What type(s) of surgery has your child had or is scheduled for? (Select all that apply)',
    multi: true,
    options: [
      'Open heart surgery',
      'Cardiac catheterization',
      'Brain / neurosurgery (shunt, tumor removal, etc.)',
      'Craniosynostosis repair (skull surgery)',
      'Spinal surgery (fusion, tethered cord release, etc.)',
      'Orthopedic surgery (hip, clubfoot, leg lengthening, etc.)',
      'Abdominal / GI surgery',
      'Airway surgery (tracheostomy, laryngoscopy, etc.)',
      'Ear tubes (tympanostomy)',
      'Cochlear implant surgery',
      'Eye surgery (strabismus, etc.)',
      'Cleft lip or palate repair',
      'Feeding tube placement (G-tube, etc.)',
      'Kidney or urological surgery',
      'Tumor or cancer surgery',
      'Organ transplant',
      'Multiple / complex surgeries',
      'Other surgery',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const s = answers['child_surgery'] ?? [];
      return !s.includes('Yes — already had surgery') && !s.includes('Surgery scheduled / upcoming');
    },
  },
  {
    id: 'feeding_method',
    question: 'How does your child eat?',
    multi: true,
    options: [
      'Breastfeeding',
      'Formula feeding',
      'Exclusive pumping',
      'Combination feeding',
      'Tube feeding (G-tube, GJ-tube, NG-tube)',
      'Eating solids',
      'None / Not applicable',
    ],
  },
  {
    id: 'breastfeeding_detail',
    question: 'Tell us more about your breastfeeding journey:',
    multi: true,
    options: [
      'Over supplier',
      'Just enougher',
      'Low supply / Under supplier',
      'Extended breastfeeding (1+ year)',
      'Weaning',
      'Nursing strike',
      'Prefer not to say',
    ],
    skipIf: (answers) => !(answers['feeding_method'] ?? []).includes('Breastfeeding'),
  },
  {
    id: 'formula_detail',
    question: 'Which type of formula does your child use?',
    multi: true,
    options: [
      'Standard formula (no issues)',
      'Specialty formula needed',
      'Hypoallergenic formula (e.g. Nutramigen, Alimentum)',
      'Amino acid formula (e.g. Elecare, Neocate)',
      'Donor breast milk',
      'Prefer not to say',
    ],
    skipIf: (answers) => !(answers['feeding_method'] ?? []).includes('Formula feeding'),
  },
  {
    id: 'pumping_detail',
    question: 'Tell us more about your pumping journey:',
    multi: true,
    options: [
      'Over supplier',
      'Just enougher',
      'Low supply / Under supplier',
      'Using a hospital-grade / rental pump',
      'Prefer not to say',
    ],
    skipIf: (answers) => !(answers['feeding_method'] ?? []).includes('Exclusive pumping'),
  },
  {
    id: 'tube_feeding_detail',
    question: 'Which type of tube feeding does your child have?',
    multi: true,
    options: [
      'G-tube (gastrostomy tube)',
      'GJ-tube (gastrojejunostomy tube)',
      'NG-tube (nasogastric tube)',
      'NJ-tube (nasojejunal tube)',
      'J-tube (jejunostomy tube)',
      'Transitioning off tube feeding',
      'Prefer not to say',
    ],
    skipIf: (answers) => !(answers['feeding_method'] ?? []).includes('Tube feeding (G-tube, GJ-tube, NG-tube)'),
  },
  {
    id: 'solids_detail',
    question: 'Tell us more about your child and solid foods:',
    multi: true,
    options: [
      'Just starting solids (4–6 months)',
      'Baby-led weaning (BLW)',
      'Puree / spoon feeding',
      'Toddler eating (finger foods)',
      'Food allergies / intolerances',
      'Extreme picky eating',
      'Oral aversion / food refusal',
      'Prefer not to say',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['feeding_method'] ?? []).includes('Eating solids'),
  },
  {
    id: 'sleep_challenges',
    question: 'Does your child have any sleep challenges? (Select all that apply)',
    multi: true,
    options: [
      'Difficulty falling asleep / sleep onset struggles',
      'Frequent night wakings',
      'Early morning waking (before 6am)',
      'Short naps / nap refusal',
      'Sleep regressions',
      'Night terrors or nightmares',
      'Co-sleeping / bedsharing',
      'Currently sleep training (or recently completed)',
      'No significant sleep challenges',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'sleep_training_method',
    question: 'Which sleep training approach are you using or have you used?',
    multi: true,
    options: [
      'Ferber method / graduated extinction',
      'Full extinction / Cry It Out (CIO)',
      'Chair method / Sleep Lady Shuffle',
      'Pick Up Put Down (PUPD)',
      'No Cry Sleep Solution',
      'Gentle / attachment-based approach',
      'Working with a sleep consultant',
    ],
    hasRequestButton: true,
    skipIf: (answers) =>
      !(answers['sleep_challenges'] ?? []).includes('Currently sleep training (or recently completed)'),
  },
  {
    id: 'sleep_cosleeping_detail',
    question: 'What best describes your co-sleeping or bedsharing situation?',
    multi: true,
    options: [
      'Intentional bedsharing (same bed, by choice)',
      'Room sharing — baby on a separate surface in our room',
      'Side-car / bassinet pulled up to our bed',
      'Child comes to our bed during the night',
      'Transitioning out of our bed',
    ],
    skipIf: (answers) =>
      !(answers['sleep_challenges'] ?? []).includes('Co-sleeping / bedsharing'),
  },
  {
    id: 'mental_health',
    question: 'Are you experiencing any mental health challenges? (Select all that apply)',
    multi: true,
    options: [
      'Postpartum depression (PPD)',
      'Postpartum anxiety (PPA)',
      'Postpartum OCD',
      'Postpartum rage',
      'Postpartum psychosis (survivor)',
      'Prenatal / antepartum depression or anxiety',
      'Birth trauma or PTSD',
      'Caregiver burnout',
      'Grief from pregnancy or infant loss',
      'General parental anxiety or depression',
      'Chronic or pre-existing mental health condition',
      'Seeking support / not sure what I\'m experiencing',
      'No current mental health challenges',
      'Prefer not to say',
    ],
    hasRequestButton: true,
  },
  {
    id: 'mental_health_ppd_ppa_detail',
    question: 'Tell us more about where you are in your PPD / PPA journey:',
    multi: true,
    options: [
      'Currently experiencing it',
      'In treatment / seeing a provider',
      'On medication',
      'In recovery / reflecting on my journey',
      'Paternal / non-birthing partner experiencing PPD or PPA',
      'Struggling to get a diagnosis or find support',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const mh = answers['mental_health'] ?? [];
      return !mh.includes('Postpartum depression (PPD)') && !mh.includes('Postpartum anxiety (PPA)');
    },
  },
  {
    id: 'dietary_restrictions',
    question: 'Does your family have any dietary restrictions or food needs?',
    multi: true,
    options: [
      'Food allergies',
      'Special diet (vegan, vegetarian, kosher, halal, etc.)',
      'Medical diet (celiac, diabetic, elimination diet, etc.)',
      'No dietary restrictions',
      'Prefer not to say',
    ],
    hasRequestButton: true,
  },
  {
    id: 'dietary_allergies_detail',
    question: 'Which food allergies does your family manage? (Select all that apply)',
    multi: true,
    options: [
      'Peanut allergy',
      'Tree nut allergy',
      'Milk / dairy allergy',
      'Egg allergy',
      'Wheat / gluten allergy',
      'Soy allergy',
      'Fish or shellfish allergy',
      'Sesame allergy',
      'Multiple food allergies',
      'Anaphylactic / severe allergy (epi-pen required)',
      'Eosinophilic Esophagitis (EoE)',
      'FPIES (Food Protein-Induced Enterocolitis Syndrome)',
      'Other food allergy',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['dietary_restrictions'] ?? []).includes('Food allergies'),
  },
  {
    id: 'dietary_special_detail',
    question: 'What type of special or medical diet does your family follow? (Select all that apply)',
    multi: true,
    options: [
      'Gluten-free (celiac or non-celiac sensitivity)',
      'Dairy-free',
      'Vegan',
      'Vegetarian',
      'Kosher',
      'Halal',
      'Keto / low-carb',
      'Paleo',
      'AIP (Autoimmune Protocol)',
      'Elimination diet',
      'GAPS or SCD diet',
      'Low-sugar / diabetic management diet',
      'Other special diet',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const d = answers['dietary_restrictions'] ?? [];
      return !d.includes('Special diet (vegan, vegetarian, kosher, halal, etc.)') &&
             !d.includes('Medical diet (celiac, diabetic, elimination diet, etc.)');
    },
  },
  {
    id: 'challenges_main',
    question: 'What are your biggest challenges right now? (Select all that apply)',
    multi: true,
    options: [
      'Feeding difficulties',
      'Sleep challenges',
      'Behavioral challenges',
      'Medical appointments / therapies',
      'Finding childcare',
      'Financial strain',
      'Isolation / lack of support',
      'Navigating systems (school, medical, insurance)',
      'Development & milestones',
      'None of these',
    ],
    hasRequestButton: true,
  },
  {
    id: 'challenges_feeding_detail',
    question: 'Which feeding challenges are you navigating?',
    multi: true,
    options: [
      'ARFID (Avoidant / Restrictive Food Intake Disorder)',
      'Tube weaning',
      'Feeding therapy',
      'Oral aversion / food refusal',
      'Failure to thrive / growth concerns',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Feeding difficulties'),
  },
  {
    id: 'challenges_sleep_detail',
    question: 'Which sleep challenges are you navigating?',
    multi: true,
    options: [
      'Sleep training',
      'Night waking / wakeful sleeper',
      'Sleep regressions',
      'Co-sleeping / bedsharing',
      'Early rising',
      'Night terrors / nightmares',
    ],
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Sleep challenges'),
  },
  {
    id: 'challenges_behavior_detail',
    question: 'Which behavioral challenges are you navigating?',
    multi: true,
    options: [
      'Tantrums & meltdowns',
      'Oppositional behavior (ODD)',
      'Aggression',
      'ABA therapy journey',
      'Child anxiety',
      'School refusal',
      'Self-injurious behavior',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Behavioral challenges'),
  },
  {
    id: 'challenges_medical_detail',
    question: 'Which medical / therapy challenges are you navigating?',
    multi: true,
    options: [
      'High appointment load (10+ per year)',
      'Multiple therapies (OT, PT, SLP, etc.)',
      'Awaiting a diagnosis',
      'Medically complex / fragile child',
      'Home health nursing involved',
    ],
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Medical appointments / therapies'),
  },
  {
    id: 'challenges_childcare_detail',
    question: 'Which childcare challenges are you navigating?',
    multi: true,
    options: [
      'Finding childcare for a child with special needs',
      'Finding an inclusive daycare or school',
      'Long waitlists / no availability',
      'Caregiver burnout',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Finding childcare'),
  },
  {
    id: 'challenges_financial_detail',
    question: 'Which financial challenges are you navigating?',
    multi: true,
    options: [
      'Medical bills / out-of-pocket costs',
      'Therapy costs not covered by insurance',
      'SSI / disability benefits navigation',
      'Food or housing instability',
      'FMLA / disability leave navigation',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Financial strain'),
  },
  {
    id: 'challenges_isolation_detail',
    question: 'What makes you feel isolated or unsupported?',
    multi: true,
    options: [
      'Hard to find other parents in my situation',
      'Geographic isolation (rural / remote area)',
      'Single parent without a support system',
      'Looking for online-only support',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Isolation / lack of support'),
  },
  {
    id: 'challenges_systems_detail',
    question: 'Which systems are you navigating?',
    multi: true,
    options: [
      'IEP / special education at school',
      'Insurance denials / appeals',
      'Medical records / care coordination',
      'State waiver programs (Medicaid waiver, etc.)',
      'FMLA / disability leave',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Navigating systems (school, medical, insurance)'),
  },
  {
    id: 'challenges_development_detail',
    question: 'Which developmental challenges are you navigating?',
    multi: true,
    options: [
      'Speech delay',
      'Developmental delay',
      'Gross motor / walking delays',
      'Potty training struggles',
      'Gifted child / twice exceptional',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['challenges_main'] ?? []).includes('Development & milestones'),
  },
  {
    id: 'school_type',
    question: 'What type of school or childcare does your child attend?',
    multi: true,
    options: [
      'Public school (K–12)',
      'Private school (K–12)',
      'Homeschool / Home education',
      'Daycare / Childcare center',
      'Preschool / Pre-K program',
      'In-home childcare (nanny, au pair, or family member)',
      'Not in school or childcare yet',
      'None of these / Other',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'school_public_detail',
    question: "What best describes your child's public school experience?",
    multi: true,
    options: [
      'General education / mainstream classroom',
      'IEP — special education services',
      'Inclusion classroom (general ed with supports)',
      'Self-contained special education classroom',
      'Magnet school',
      'Charter school',
      'Title I / high-need school',
      'Virtual / online public school',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['school_type'] ?? []).includes('Public school (K–12)'),
  },
  {
    id: 'school_private_detail',
    question: 'What type of private school does your child attend?',
    multi: false,
    options: [
      'Secular / academic private school',
      'Faith-based / religious school',
      'Montessori school',
      'Waldorf school',
      'Private special education school',
      'College prep or boarding school',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['school_type'] ?? []).includes('Private school (K–12)'),
  },
  {
    id: 'school_homeschool_detail',
    question: 'What homeschool style or approach do you use?',
    multi: true,
    options: [
      'Classical education',
      'Charlotte Mason method',
      'Unschooling / child-led learning',
      'Eclectic / mix of methods',
      'Online / virtual (hybrid homeschool)',
      'Homeschool co-op',
      'Homeschooling due to special needs or medical needs',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['school_type'] ?? []).includes('Homeschool / Home education'),
  },
  {
    id: 'school_childcare_detail',
    question: 'What best describes your childcare or preschool setting?',
    multi: false,
    options: [
      'Large daycare center',
      'Small home daycare / family childcare',
      'Employer-sponsored or corporate daycare',
      'Faith-based / church daycare or preschool',
      'Head Start / Early Head Start program',
      'Montessori preschool',
      'Military CDC (Child Development Center)',
      'Nanny (in-home caregiver)',
      'Au pair',
      'Grandparent or family member',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const s = answers['school_type'] ?? [];
      return !s.includes('Daycare / Childcare center') &&
             !s.includes('Preschool / Pre-K program') &&
             !s.includes('In-home childcare (nanny, au pair, or family member)');
    },
  },
  {
    id: 'iep_504',
    question: 'Does your child have an IEP or 504 plan?',
    multi: true,
    options: [
      'IEP (Individualized Education Program)',
      '504 Plan',
      'Early Intervention (under age 3 — Part C)',
      'In process of getting an evaluation',
      "My child was denied — I'm fighting for services",
      'Neither — general education',
      'Not applicable / too young',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'iep_services_detail',
    question: "What does your child's IEP primarily cover? (Select all that apply)",
    multi: true,
    options: [
      'Speech-Language (SLP) services',
      'Occupational Therapy (OT) services',
      'Physical Therapy (PT) services',
      'Behavioral support / Behavior Intervention Plan (BIP)',
      'Academic accommodations and modifications',
      'Autism services',
      'Intellectual disability support',
      'Multiple / complex needs',
      'Extended School Year (ESY) services',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['iep_504'] ?? []).includes('IEP (Individualized Education Program)'),
  },
  {
    id: 'iep_504_plan_detail',
    question: "What does your child's 504 plan primarily address?",
    multi: true,
    options: [
      'ADHD-related accommodations (extra time, movement breaks, etc.)',
      'Anxiety or mental health needs',
      'Physical or medical needs (diabetes, seizures, allergies, etc.)',
      'Sensory accommodations',
      'Reading or writing accommodations',
      'Other accommodations',
    ],
    skipIf: (answers) => !(answers['iep_504'] ?? []).includes('504 Plan'),
  },
  {
    id: 'iep_process_detail',
    question: 'Where are you in the evaluation or advocacy process?',
    multi: true,
    options: [
      'Just requested an evaluation',
      'Evaluation scheduled or currently underway',
      'Waiting for eligibility determination',
      'Navigating a denial or disagreement with the school',
      'Seeking a private / independent evaluation',
      'Filing a complaint or going to due process',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const p = answers['iep_504'] ?? [];
      return !p.includes('In process of getting an evaluation') &&
             !p.includes("My child was denied — I'm fighting for services");
    },
  },
  {
    id: 'child_therapy',
    question: 'Does your child attend therapy?',
    multi: true,
    options: [
      'Yes — private therapy outside of school',
      'School-based services only (IEP / IFSP)',
      'Both private and school-based therapy',
      'On a waitlist for therapy',
      'No therapy currently',
      'We completed therapy / graduated',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const boe = answers['born_or_expecting']?.[0];
      const numKids = answers['num_kids']?.[0];
      return (boe === "We're expecting" && numKids === '1') ||
             (boe === 'Planning / Trying to Conceive (TTC)' && (numKids === '0 / None yet' || !numKids));
    },
  },
  {
    id: 'child_therapy_private_types',
    question: 'What types of private therapy does your child receive? (Select all that apply)',
    multi: true,
    options: [
      'Speech-Language Therapy (SLP)',
      'Occupational Therapy (OT)',
      'Physical Therapy (PT)',
      'ABA (Applied Behavior Analysis)',
      'Feeding therapy',
      'Developmental therapy',
      'Vision therapy',
      'Child psychologist / mental health therapy',
      'Social skills group',
      'Play therapy',
      'Music therapy',
      'Aquatic therapy',
      'Hippotherapy / equine therapy',
      'Other private therapy',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const t = answers['child_therapy'] ?? [];
      return !t.includes('Yes — private therapy outside of school') &&
             !t.includes('Both private and school-based therapy');
    },
  },
  {
    id: 'work_status',
    question: 'Do you currently work?',
    multi: false,
    options: [
      'Yes — full time',
      'Yes — part time',
      "No — I'm a stay at home parent",
      'On leave / between jobs',
    ],
  },
  {
    id: 'work_situation',
    question: 'What best describes the type of work you do? (Select all that apply)',
    multi: true,
    options: [
      'Night shift worker',
      'Healthcare worker',
      'Teacher / Educator',
      'Work from home / Remote',
      'Self-employed / Entrepreneur / Business owner',
      'Working multiple jobs',
      'None of these / Other',
    ],
    hasRequestButton: true,
    skipIf: (answers) => {
      const status = answers['work_status']?.[0];
      return status === "No — I'm a stay at home parent" || status === 'On leave / between jobs';
    },
  },
  {
    id: 'work_night_detail',
    question: 'What kind of night shift do you work?',
    multi: true,
    options: [
      'Healthcare / Hospital',
      'Hospitality / Food & beverage service',
      'Security / Law enforcement',
      'Transportation / Logistics',
      'Factory / Warehouse',
      'Other night shift',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['work_situation'] ?? []).includes('Night shift worker'),
  },
  {
    id: 'work_healthcare_detail',
    question: 'What is your healthcare role?',
    multi: true,
    options: [
      'Registered Nurse (RN)',
      'LPN / CNA / Medical aide',
      'Doctor / Physician / Surgeon',
      'Paramedic / EMT / First Responder',
      'Mental health professional (therapist, counselor, psychologist)',
      'Physical / Occupational / Speech Therapist',
      'Pharmacist',
      'Medical admin / Support staff',
      'Other healthcare role',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['work_situation'] ?? []).includes('Healthcare worker'),
  },
  {
    id: 'work_teacher_detail',
    question: 'What level do you teach?',
    multi: true,
    options: [
      'Early childhood / Preschool',
      'Elementary school (K–5)',
      'Middle school (6–8)',
      'High school (9–12)',
      'Special education',
      'College / University',
      'Instructional aide / Paraprofessional',
      'Other educator role',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['work_situation'] ?? []).includes('Teacher / Educator'),
  },
  {
    id: 'work_wfh_detail',
    question: 'What best describes your work from home situation?',
    multi: true,
    options: [
      'Remote employee (company job done remotely)',
      'Freelancer / Independent contractor',
      'Entrepreneur / Business owner',
      'Content creator / Influencer',
      'Home childcare provider / Home daycare',
      'Other WFH situation',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['work_situation'] ?? []).includes('Work from home / Remote'),
  },
  {
    id: 'work_selfemployed_detail',
    question: 'What best describes your business or self-employment?',
    multi: true,
    options: [
      'Small business owner (local / brick & mortar)',
      'Online business / e-commerce',
      'Freelancer / Independent contractor',
      'Content creator / Influencer / Blogger',
      'Consultant or coach',
      'Other self-employment',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['work_situation'] ?? []).includes('Self-employed / Entrepreneur / Business owner'),
  },
  {
    id: 'work_sahp_detail',
    question: 'What best describes your SAHP situation?',
    multi: true,
    options: [
      'By choice — preferred arrangement',
      'Due to childcare costs',
      "Due to child's medical or special needs",
      'Recently transitioned / new to SAHP life',
      'Planning to return to work soon',
    ],
    hasRequestButton: true,
    skipIf: (answers) => answers['work_status']?.[0] !== "No — I'm a stay at home parent",
  },
  {
    id: 'work_multiple_jobs_detail',
    question: 'What best describes your situation?',
    multi: true,
    options: [
      'Working two jobs (full-time + part-time)',
      'Working three or more jobs',
      'Gig work / Rideshare / Delivery',
      'Side hustle alongside main job',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['work_situation'] ?? []).includes('Working multiple jobs'),
  },
  {
    id: 'insurance_type',
    question: 'What type of health insurance does your family have?',
    multi: true,
    options: [
      'Medicaid / CHIP',
      'Private insurance (employer or marketplace)',
      'TRICARE (military)',
      'Uninsured / No coverage',
      'Medicaid waiver',
      'Not sure / Other',
    ],
  },
  {
    id: 'insurance_medicaid_detail',
    question: 'What are you navigating with Medicaid / CHIP?',
    multi: true,
    options: [
      'Medicaid for my child (CHIP)',
      'Medicaid for parent(s) too',
      'Medicaid denials or appeals',
      'Finding Medicaid-accepting providers',
      'Transitioning off Medicaid due to income changes',
      'Medicaid renewals / redeterminations',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['insurance_type'] ?? []).includes('Medicaid / CHIP'),
  },
  {
    id: 'insurance_private_detail',
    question: 'What are you navigating with private insurance?',
    multi: true,
    options: [
      'Employer-sponsored plan',
      'ACA / Marketplace plan',
      'Insurance denials for therapy or treatments',
      'Out-of-network providers or costs',
      'High deductibles or out-of-pocket costs',
      'COBRA / between jobs coverage',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['insurance_type'] ?? []).includes('Private insurance (employer or marketplace)'),
  },
  {
    id: 'insurance_tricare_detail',
    question: 'What type of TRICARE do you have?',
    multi: true,
    options: [
      'TRICARE Prime',
      'TRICARE Select',
      'TRICARE for Life',
      'TRICARE Reserve Select',
      'TRICARE ECHO (Extended Care Health Option — for special needs)',
      'Still figuring out our TRICARE coverage',
    ],
    skipIf: (answers) => !(answers['insurance_type'] ?? []).includes('TRICARE (military)'),
  },
  {
    id: 'insurance_uninsured_detail',
    question: 'What resources are you looking for?',
    multi: true,
    options: [
      'Applying for Medicaid or CHIP',
      'Free clinic or community health resources',
      'Prescription assistance programs',
      'Navigating coverage gaps between jobs',
      'Looking for affordable coverage options',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['insurance_type'] ?? []).includes('Uninsured / No coverage'),
  },
  {
    id: 'insurance_waiver_detail',
    question: 'Which Medicaid waiver do you have or are pursuing?',
    multi: true,
    options: [
      'HCBS (Home and Community-Based Services) waiver',
      'Katie Beckett / TEFRA waiver',
      'DD (Developmental Disabilities) waiver',
      'Autism waiver',
      'Technology-Assisted waiver (vent / medical equipment)',
      'On the waiver waitlist',
      'Still figuring out which waiver applies',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['insurance_type'] ?? []).includes('Medicaid waiver'),
  },
  {
    id: 'support_network',
    question: 'How would you describe your local support network?',
    multi: true,
    options: [
      'Strong local family support',
      'Limited local support',
      'No local family — friends are my village',
      'Completely isolated / no support network',
      'Long-distance family support only',
    ],
    hasRequestButton: true,
  },
  {
    id: 'support_limited_detail',
    question: 'What best describes your situation?',
    multi: true,
    options: [
      'Recently relocated / new to the area',
      'Estranged from family',
      "Family doesn't understand my child's needs",
      'Rural or remote area',
      'Everyone is too busy / schedules never align',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['support_network'] ?? []).includes('Limited local support'),
  },
  {
    id: 'support_isolated_detail',
    question: "What's contributing to your isolation?",
    multi: true,
    options: [
      'Recently relocated / no roots here yet',
      'Postpartum depression or mental health challenges',
      "Child's complex needs limit outings and activities",
      'Rural or remote location',
      'Partner works away or travels frequently',
      'Grief or major life transition',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['support_network'] ?? []).includes('Completely isolated / no support network'),
  },
  {
    id: 'support_long_distance_detail',
    question: 'What best describes your long-distance situation?',
    multi: true,
    options: [
      'Military life / frequent moves',
      'Moved for work or partner\'s career',
      'Immigrated away from home country',
      'Family is supportive but geographically far',
      'Primary support is virtual (video calls, texts)',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['support_network'] ?? []).includes('Long-distance family support only'),
  },
  {
    id: 'religion',
    question: 'What is your cultural or religious background? (Select all that apply)',
    multi: true,
    options: [
      'Christian (Protestant)',
      'Catholic',
      'Jewish',
      'Muslim',
      'Hindu',
      'Buddhist',
      'Sikh',
      'Latter-day Saint (Mormon / LDS)',
      'Orthodox Christian',
      "Jehovah's Witness",
      'Pagan / Wiccan / Earth-based spirituality',
      'Spiritual but not religious',
      'Non-religious / Secular / Atheist / Agnostic',
      'Interfaith / Multiple traditions in our household',
      'Prefer not to say',
    ],
    hasRequestButton: true,
  },
  {
    id: 'religion_christian_detail',
    question: 'Which Christian tradition best describes you?',
    multi: true,
    options: [
      'Evangelical',
      'Baptist',
      'Pentecostal / Charismatic',
      'Non-denominational',
      'Methodist / Wesleyan',
      'Lutheran',
      'Episcopal / Anglican',
      'Reformed / Presbyterian',
      'Seventh-day Adventist',
      'Other Protestant',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['religion'] ?? []).includes('Christian (Protestant)'),
  },
  {
    id: 'religion_catholic_detail',
    question: 'What best describes your relationship with the Catholic faith?',
    multi: false,
    options: [
      'Practicing / active Catholic',
      'Cultural Catholic',
      'Traditional / Latin Mass Catholic',
      'Navigating disagreements with the Church',
      'Faith transition away from Catholicism',
    ],
    skipIf: (answers) => !(answers['religion'] ?? []).includes('Catholic'),
  },
  {
    id: 'religion_jewish_detail',
    question: 'Which Jewish movement or tradition?',
    multi: false,
    options: [
      'Orthodox',
      'Modern Orthodox',
      'Conservative / Masorti',
      'Reform / Progressive',
      'Reconstructionist / Renewal',
      'Cultural / Secular Jewish',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['religion'] ?? []).includes('Jewish'),
  },
  {
    id: 'religion_muslim_detail',
    question: 'Which Muslim tradition?',
    multi: false,
    options: [
      'Sunni',
      'Shia',
      'Sufi',
      'Ahmadiyya',
      'Cultural / non-practicing Muslim',
      'Prefer not to say',
    ],
    skipIf: (answers) => !(answers['religion'] ?? []).includes('Muslim'),
  },
  {
    id: 'religion_orthodox_detail',
    question: 'Which Orthodox tradition?',
    multi: false,
    options: [
      'Greek Orthodox',
      'Russian Orthodox',
      'Coptic Orthodox',
      'Ethiopian Orthodox',
      'Antiochian Orthodox',
      'Serbian / Bulgarian / Romanian Orthodox',
      'Other Eastern Orthodox',
    ],
    skipIf: (answers) => !(answers['religion'] ?? []).includes('Orthodox Christian'),
  },
  {
    id: 'religion_lds_detail',
    question: 'What best describes your relationship with the LDS church?',
    multi: false,
    options: [
      'Active / practicing member',
      'Cultural / less active LDS',
      'Navigating a faith transition',
      'LGBTQ+ LDS family',
    ],
    skipIf: (answers) => !(answers['religion'] ?? []).includes('Latter-day Saint (Mormon / LDS)'),
  },
  {
    id: 'home_language',
    question: 'What language(s) do you speak at home?',
    multi: true,
    options: [
      'English',
      'Spanish',
      'Mandarin Chinese',
      'Cantonese Chinese',
      'Hindi',
      'Arabic',
      'French',
      'Portuguese',
      'Tagalog / Filipino',
      'Vietnamese',
      'Korean',
      'Japanese',
      'Russian',
      'Italian',
      'German',
      'Haitian Creole',
      'Punjabi',
      'Urdu',
      'Bengali',
      'Tamil',
      'Farsi / Persian',
      'Polish',
      'Ukrainian',
      'Swahili',
      'Yoruba',
      'Amharic',
      'American Sign Language (ASL)',
      'Other',
    ],
    hasRequestButton: true,
  },
  {
    id: 'language_spanish_detail',
    question: 'Which Spanish-speaking community best describes your household?',
    multi: false,
    options: [
      'Mexican / Mexican-American',
      'Puerto Rican',
      'Cuban',
      'Dominican',
      'Central American (Guatemalan, Salvadoran, etc.)',
      'Colombian / Venezuelan / South American',
      'Castilian / Spanish (from Spain)',
      'Other / Mixed',
    ],
    skipIf: (answers) => !(answers['home_language'] ?? []).includes('Spanish'),
  },
  {
    id: 'language_arabic_detail',
    question: 'Which Arabic-speaking community best describes your household?',
    multi: false,
    options: [
      'Egyptian',
      'Levantine (Syrian, Lebanese, Palestinian, Jordanian)',
      'Gulf (Saudi, Emirati, Kuwaiti, Qatari, etc.)',
      'Maghrebi / North African (Moroccan, Algerian, Tunisian, Libyan)',
      'Iraqi',
      'Sudanese / East African Arabic',
      'Modern Standard Arabic / Mixed',
    ],
    skipIf: (answers) => !(answers['home_language'] ?? []).includes('Arabic'),
  },
  {
    id: 'language_portuguese_detail',
    question: 'Which Portuguese-speaking community best describes your household?',
    multi: false,
    options: [
      'Brazilian',
      'European (Portugal)',
      'African (Cape Verdean, Mozambican, Angolan, etc.)',
      'Other / Mixed',
    ],
    skipIf: (answers) => !(answers['home_language'] ?? []).includes('Portuguese'),
  },
  {
    id: 'language_multilingual',
    question: 'Are you planning to raise your children speaking multiple languages?',
    multi: false,
    options: [
      'Yes — intentionally raising bilingual / multilingual children',
      'Working on it / hoping to',
      'One language at home, learning another outside',
      'No / Not sure yet',
    ],
    skipIf: (answers) => {
      const langs = answers['home_language'] ?? [];
      return langs.filter(l => l !== 'Prefer not to say').length < 2;
    },
  },
  {
    id: 'housing_situation',
    question: 'What is your current housing situation?',
    multi: true,
    options: [
      'Homeowner',
      'Renting / Leasing',
      'Multigenerational household (living with family)',
      'Military housing / On base',
      'Tiny home / Van life / Alternative housing',
      'Rural property / Farm',
      'Experiencing housing instability',
      'In transition / Temporarily between homes',
    ],
    hasRequestButton: true,
  },
  {
    id: 'housing_homeowner_detail',
    question: 'What kind of home do you have?',
    multi: false,
    options: [
      'Suburban single-family home',
      'Urban / City home',
      'Condo / Townhouse / Row home',
      'Rural property',
      'Farm',
      'New construction / Just built',
      'First-time homeowner — still figuring it out!',
    ],
    skipIf: (answers) => !(answers['housing_situation'] ?? []).includes('Homeowner'),
  },
  {
    id: 'housing_renting_detail',
    question: 'What kind of rental are you in?',
    multi: false,
    options: [
      'Urban apartment',
      'Suburban apartment or complex',
      'House or townhouse rental',
      'Condo rental',
      'Saving up to buy',
    ],
    skipIf: (answers) => !(answers['housing_situation'] ?? []).includes('Renting / Leasing'),
  },
  {
    id: 'housing_multigenerational_detail',
    question: 'Who lives with you?',
    multi: true,
    options: [
      'My parents / my side of the family',
      "Partner's parents / in-laws",
      'Multiple generations (grandparents, parents, and children)',
      'Parents or in-laws in a separate attached unit or ADU',
    ],
    skipIf: (answers) => !(answers['housing_situation'] ?? []).includes('Multigenerational household (living with family)'),
  },
  {
    id: 'housing_alternative_detail',
    question: 'What kind of alternative housing?',
    multi: false,
    options: [
      'Tiny home',
      'Van life',
      'Skoolie (converted school bus)',
      'Full-time RV / travel trailer',
      'Off-grid / Earthship / Yurt',
    ],
    skipIf: (answers) => !(answers['housing_situation'] ?? []).includes('Tiny home / Van life / Alternative housing'),
  },
  {
    id: 'housing_instability_detail',
    question: 'What are you navigating?',
    multi: true,
    options: [
      'At risk of eviction',
      'Facing foreclosure',
      'Staying with others temporarily',
      'In a shelter or transitional housing',
      'Working toward stable housing',
      'Navigating housing assistance programs',
    ],
    hasRequestButton: true,
    skipIf: (answers) => !(answers['housing_situation'] ?? []).includes('Experiencing housing instability'),
  },
  {
    id: 'transportation',
    question: 'Do you have reliable transportation?',
    multi: true,
    options: [
      'Yes — I have a reliable car',
      'I use public transportation',
      'Limited or unreliable vehicle',
      'No car — I rely on rides from others',
      'No car — I live in a walkable / bikeable area',
      'No car — rural area with limited transit options',
      'Prefer not to say',
    ],
    hasRequestButton: true,
  },
  {
    id: 'transportation_public_detail',
    question: 'Which type of public transportation do you mainly use?',
    multi: true,
    options: [
      'City bus / local bus routes',
      'Metro / subway / light rail',
      'Commuter rail / regional train',
      'Paratransit / accessible transit service',
      'Limited routes — not many options where I live',
      'Multiple transfers needed to get anywhere with kids',
    ],
    skipIf: (answers) => !(answers['transportation'] ?? []).includes('I use public transportation'),
  },
  {
    id: 'transportation_unreliable_detail',
    question: 'What best describes your vehicle situation?',
    multi: true,
    options: [
      'One car shared between household members',
      'Car frequently needs repairs',
      'Saving up for a reliable car',
      'Recently lost access to a vehicle',
    ],
    skipIf: (answers) => !(answers['transportation'] ?? []).includes('Limited or unreliable vehicle'),
  },
  {
    id: 'location',
    question: 'Where do you live?',
    multi: false,
    options: [],
    type: 'location',
  },
];

// Map quiz answers to suggested village ids
function suggestVillages(answers: Record<string, string[]>): string[] {
  const suggested = new Set<string>();

  const bornOrExpecting = answers['born_or_expecting']?.[0];
  if (bornOrExpecting === 'Planning / Trying to Conceive (TTC)') {
    suggested.add('ttc_village');
    const ttcJourney = answers['ttc_journey'] ?? [];
    if (ttcJourney.includes('Dealing with infertility'))                              suggested.add('ttc_infertility');
    if (ttcJourney.includes('PCOS or hormonal condition'))                            suggested.add('ttc_pcos');
    if (ttcJourney.includes('Unexplained infertility'))                               suggested.add('ttc_unexplained');
    if (ttcJourney.includes('Been trying for 6–12 months') ||
        ttcJourney.includes('Long journey — trying for 1+ year'))                     suggested.add('ttc_long_journey');
    if (ttcJourney.includes('Secondary infertility (already have a child)'))          suggested.add('ttc_secondary_infertility');
    if (ttcJourney.includes('Currently in fertility treatments (IVF, IUI, etc.)'))    suggested.add('ttc_treatments');
    if (ttcJourney.includes('TTC after a pregnancy loss'))                            suggested.add('ttc_after_loss');
    if (ttcJourney.includes('LGBTQ+ family building'))                                { suggested.add('ttc_lgbtq_family_building'); suggested.add('lgbtq'); }
  }

  const gender = answers['gender'] ?? [];
  if (gender.includes('Boy'))  suggested.add('boy_parents');
  if (gender.includes('Girl')) suggested.add('girl_parents');
  const genderIdentity = answers['gender_identity'] ?? [];
  if (genderIdentity.includes('Non-binary'))              suggested.add('nonbinary_child_parents');
  if (genderIdentity.includes('Transgender Boy (FTM)'))   suggested.add('trans_boy_parents');
  if (genderIdentity.includes('Transgender Girl (MTF)'))  suggested.add('trans_girl_parents');
  if (genderIdentity.includes('Gender fluid'))            suggested.add('gender_fluid_child_parents');
  if (genderIdentity.includes('Questioning / Exploring')) suggested.add('gender_questioning_parents');
  if (answers['born_or_expecting']?.[0] === "We're expecting") {
    const month = answers['due_date']?.[0];
    if (month) suggested.add(`due_${toVillageId(month)}`);
  }
  const kidCount = answers['num_kids']?.[0];
  if (kidCount === 'I have more')    suggested.add('large_family');
  else if (kidCount === '1')         suggested.add('first_time');
  else if (kidCount && kidCount !== '0 / None yet') suggested.add(`kids_${kidCount}`);
  const familyPlanning = answers['family_planning']?.[0];
  if (familyPlanning === "No — we're one and done") {
    suggested.add('one_and_done');
    suggested.add('only_child_parents');
  }
  if (familyPlanning === 'No — our family feels complete') suggested.add('family_complete');
  const multiples = answers['multiples'] ?? [];
  if (multiples.some(m => m !== 'No')) suggested.add('multiples');
  if (multiples.includes('Twins')) {
    suggested.add('twins');
    const twinsType = answers['twins_type'] ?? [];
    if (twinsType.includes('Identical Twins'))       suggested.add('identical_twins');
    if (twinsType.includes('Fraternal Twins'))        suggested.add('fraternal_twins');
    if (twinsType.includes('Multiple sets of twins')) suggested.add('super_multiples');
  }
  if (multiples.includes('Triplets'))    suggested.add('triplets');
  if (multiples.includes('Quadruplets')) suggested.add('quadruplets');
  if (multiples.includes('Quintuplets')) suggested.add('quintuplets');
  if (multiples.includes('I have more')) suggested.add('super_multiples');
  const locCountry = answers['location_country']?.[0];
  const locState   = answers['location_state']?.[0];
  const locCity    = answers['location_city']?.[0];
  if (locCountry && locCountry !== 'Other') suggested.add(`country_${toVillageId(locCountry)}`);
  if (locState)  suggested.add(`state_${toVillageId(locState)}`);
  if (locCity)   suggested.add(`city_${toVillageId(locCity)}`);
  (answers['child_age'] ?? []).forEach(label => {
    const match = CHILD_AGES.find(a => a.label === label);
    if (match) { suggested.add(match.id); suggested.add(match.stage); }
  });
  if (answers['loss_parent']?.[0] === 'Yes') {
    suggested.add('bereaved_parents');
    const lossType = answers['loss_type'] ?? [];
    const isMiscarriage = lossType.includes('Miscarriage (1st trimester)') || lossType.includes('Miscarriage (2nd trimester)');
    if (isMiscarriage)                                              { suggested.add('pregnancy_loss'); suggested.add('miscarriage_parents'); }
    if (lossType.includes('Ectopic or molar pregnancy'))            { suggested.add('pregnancy_loss'); suggested.add('ectopic_loss'); }
    if (lossType.includes('TFMR (Termination for Medical Reasons)'))  suggested.add('tfmr_parents');
    if (lossType.includes('Stillbirth (20+ weeks)'))                  suggested.add('stillbirth_parents');
    if (lossType.includes('Loss shortly after birth (NICU / prematurity complications)')) suggested.add('infant_loss');
    if (lossType.includes('SIDS (Sudden Infant Death Syndrome)'))   { suggested.add('sids_parents'); suggested.add('infant_loss'); }
    if (lossType.includes('SUDC (Sudden Unexplained Death in Childhood)')) { suggested.add('sudc_parents'); suggested.add('child_loss'); }
    if (lossType.includes('SADS (Sudden Arrhythmia Death Syndrome)'))      { suggested.add('sads_parents'); suggested.add('child_loss'); }
    if (lossType.includes('Illness or medical condition'))            suggested.add('child_loss');
    if (lossType.includes('Pediatric cancer'))                      { suggested.add('pediatric_cancer_loss'); suggested.add('child_loss'); }
    if (lossType.includes('Accident or injury'))                      suggested.add('child_loss');
  }
  const neuroDev     = answers['neuro_dev'] ?? [];
  const genderAnswers = answers['gender'] ?? [];
  if (neuroDev.some(n => n.startsWith('Autism'))) suggested.add('autism');
  if (neuroDev.includes('Autism Level 1')) {
    const diagType = answers['autism_l1_girl_type']?.[0];
    if (diagType === 'Late / Missed Diagnosis') suggested.add('autism_l1_late_diagnosis');
    if (genderAnswers.includes('Girl')) suggested.add('autism_l1_girls');
    if (genderAnswers.includes('Boy'))  suggested.add('autism_l1_boys');
    if (!genderAnswers.length)          { suggested.add('autism_l1_girls'); suggested.add('autism_l1_boys'); }
  }
  if (neuroDev.includes('Autism Level 2'))              suggested.add('autism_l2');
  if (neuroDev.includes('Autism Level 3'))              suggested.add('autism_l3');
  if (neuroDev.includes('ADHD'))                        suggested.add('adhd_parents');
  if (neuroDev.includes('Sensory Processing Differences')) {
    suggested.add('spd_parents');
    const spdTypes = answers['spd_type'] ?? [];
    if (spdTypes.includes('Tactile sensitivity (touch / textures)'))             suggested.add('spd_tactile');
    if (spdTypes.includes('Auditory sensitivity (sounds)'))                      suggested.add('spd_auditory');
    if (spdTypes.includes('Visual sensitivity (light / motion)'))                suggested.add('spd_visual');
    if (spdTypes.includes('Oral / gustatory sensitivity (taste / food textures)')) suggested.add('spd_oral');
    if (spdTypes.includes('Olfactory sensitivity (smells)'))                     suggested.add('spd_olfactory');
    if (spdTypes.includes('Proprioceptive differences (body awareness / pressure)')) suggested.add('spd_proprioception');
    if (spdTypes.includes('Vestibular differences (balance / movement)'))        suggested.add('spd_vestibular');
    if (spdTypes.includes('Interoceptive differences (internal body sensations)')) suggested.add('spd_interoception');
    if (spdTypes.includes('Sensory seeking'))                                    suggested.add('spd_seeking');
    if (spdTypes.includes('Sensory avoidance'))                                  suggested.add('spd_avoidance');
  }
  // ADHD subtype drill-down
  const adhdType = answers['adhd_type']?.[0];
  if (adhdType === 'Inattentive Type (ADD)')         suggested.add('adhd_inattentive');
  if (adhdType === 'Hyperactive-Impulsive Type')     suggested.add('adhd_hyperactive');
  if (adhdType === 'Combined Type')                  suggested.add('adhd_combined');
  if (adhdType === 'Awaiting / Unsure of Diagnosis') suggested.add('adhd_pending_diagnosis');
  // Learning disability drill-down
  const ldTypes = answers['learning_disability_type'] ?? [];
  if (ldTypes.length > 0)                                                  suggested.add('ld_general');
  if (ldTypes.includes('Dyslexia'))                                        suggested.add('dyslexia_parents');
  if (ldTypes.includes('Dyscalculia'))                                     suggested.add('dyscalculia_parents');
  if (ldTypes.includes('Dysgraphia'))                                      suggested.add('dysgraphia_parents');
  if (ldTypes.includes('Dyspraxia / Developmental Coordination Disorder')) suggested.add('dyspraxia_parents');
  if (ldTypes.includes('Auditory Processing Disorder'))                    suggested.add('apd_parents');
  if (ldTypes.includes('Nonverbal Learning Disability (NVLD)'))            suggested.add('nvld_parents');
  if (ldTypes.includes('Other Learning Disability'))                       suggested.add('ld_other');
  const gestAge = answers['gestational_age']?.[0];
  if (gestAge === 'Under 22 weeks (Periviable)')         suggested.add('preemie_periviable');
  if (gestAge === '22–24 weeks (Extreme Prematurity)')   suggested.add('preemie_extreme');
  if (gestAge === '25–32 weeks (Moderate Prematurity)')  suggested.add('preemie_moderate');
  if (gestAge === '33–36 weeks (Late Preterm)')          suggested.add('preemie_late');
  if (answers['nicu_experience']?.[0] === 'Yes — they were in the NICU') suggested.add('nicu');

  const birthType = answers['birth_type'] ?? [];
  if (birthType.includes('Vaginal birth'))                                    suggested.add('vaginal_birth_parents');
  if (birthType.includes('Unmedicated / natural birth'))                      suggested.add('unmedicated_birth_parents');
  if (birthType.includes('Home birth'))                                       suggested.add('home_birth_parents');
  if (birthType.includes('Birth center birth'))                               suggested.add('birth_center_parents');
  if (birthType.includes('Water birth'))                                      suggested.add('water_birth_parents');
  if (birthType.includes('Induced labor'))                                    suggested.add('induced_labor_parents');
  if (birthType.includes('Planned C-section') || birthType.includes('Emergency C-section')) {
    suggested.add('csection_parents');
    const csDetail = answers['birth_csection_detail'] ?? [];
    if (birthType.includes('Planned C-section'))                              suggested.add('planned_csection_parents');
    if (birthType.includes('Emergency C-section'))                            suggested.add('emergency_csection_parents');
    if (csDetail.includes('Difficult recovery'))                              suggested.add('birth_trauma_parents');
  }
  if (birthType.includes('VBAC (Vaginal Birth After Cesarean)')) {
    suggested.add('vbac_parents');
    const vbacDetail = answers['birth_vbac_detail'] ?? [];
    if (vbacDetail.includes('Planning a VBAC for an upcoming birth'))         suggested.add('vbac_planning_parents');
    if (vbacDetail.includes('Attempted VBAC that ended in C-section'))        suggested.add('emergency_csection_parents');
  }
  if (birthType.includes('Emergency C-section') || birthType.includes('Experienced birth trauma')) {
    suggested.add('birth_trauma_parents');
    const traumaDetail = answers['birth_trauma_detail'] ?? [];
    if (traumaDetail.includes('Postpartum hemorrhage'))                       suggested.add('postpartum_hemorrhage_parents');
    if (traumaDetail.includes('Birth-related PTSD or anxiety'))               suggested.add('birth_ptsd_parents');
  }
  // Medical diagnosis top-level
  const medDx = answers['medical_diagnosis'] ?? [];
  if (medDx.includes('Down Syndrome'))           suggested.add('ds_general');
  if (medDx.includes('Cerebral Palsy'))          suggested.add('cerebral_palsy');
  if (medDx.includes('Congenital Heart Defect')) suggested.add('chd_general');
  if (medDx.includes('Pediatric Cancer')) {
    suggested.add('pediatric_cancer_parents');
    const cancerType = answers['pediatric_cancer_type'] ?? [];
    if (cancerType.includes('Leukemia (ALL or AML)'))                    suggested.add('childhood_leukemia_parents');
    if (cancerType.includes('Brain tumor'))                               suggested.add('brain_tumor_parents');
    if (cancerType.includes('Neuroblastoma'))                             suggested.add('neuroblastoma_parents');
    if (cancerType.includes('Childhood cancer survivor'))                 suggested.add('childhood_cancer_survivors');
  }
  if (medDx.includes('Kidney / Urological Condition')) {
    suggested.add('kidney_condition_parents');
    const kidneyType = answers['kidney_condition_type'] ?? [];
    if (kidneyType.includes('Polycystic Kidney Disease (PKD)'))           suggested.add('pkd_parents');
    if (kidneyType.includes('Nephrotic Syndrome'))                         suggested.add('nephrotic_syndrome_parents');
    if (kidneyType.includes('Kidney transplant'))                          suggested.add('organ_transplant_parents');
  }
  if (medDx.includes('Craniosynostosis'))                                  suggested.add('craniosynostosis_parents');
  // DS subtype drill-down
  const dsSubtype = answers['ds_subtype'] ?? [];
  if (dsSubtype.includes('Trisomy 21 (Standard)')) suggested.add('ds_trisomy21');
  if (dsSubtype.includes('Translocation'))          suggested.add('ds_translocation');
  if (dsSubtype.includes('Mosaic'))                 suggested.add('ds_mosaic');
  if (dsSubtype.includes('Dual Diagnosis'))          suggested.add('ds_dual_diagnosis');
  // Genetic / chromosomal condition drill-down
  const genCond = answers['genetic_condition'] ?? [];
  if (genCond.includes('Fragile X Syndrome'))                    suggested.add('fragile_x');
  if (genCond.includes('Rett Syndrome'))                         suggested.add('rett_syndrome');
  if (genCond.includes('Prader-Willi Syndrome'))                 suggested.add('prader_willi');
  if (genCond.includes('Angelman Syndrome'))                     suggested.add('angelman');
  if (genCond.includes('Tuberous Sclerosis Complex'))            suggested.add('tuberous_sclerosis');
  if (genCond.includes('22q11.2 Deletion / DiGeorge Syndrome')) suggested.add('digeorge_22q');
  if (genCond.includes('Williams Syndrome'))                     suggested.add('williams_syndrome');
  if (genCond.includes('Ehlers-Danlos Syndrome (EDS)'))          suggested.add('eds_parents');
  if (genCond.includes('CHARGE Syndrome'))                       suggested.add('charge_syndrome');
  if (genCond.includes('Other Genetic / Chromosomal Condition')) suggested.add('rare_genetic');
  // Premature birth — routed via gestational_age (no separate question needed)
  // Other medical condition drill-down
  const otherMed = answers['other_medical_condition'] ?? [];
  if (otherMed.includes('Spina Bifida'))                    suggested.add('spina_bifida');
  if (otherMed.includes('Hydrocephalus'))                   suggested.add('hydrocephalus');
  if (otherMed.includes('Epilepsy / Seizure Disorder'))     suggested.add('epilepsy');
  if (otherMed.includes('Type 1 Diabetes'))                 suggested.add('t1d_parents');
  if (otherMed.includes('Cystic Fibrosis'))                 suggested.add('cystic_fibrosis');
  if (otherMed.includes('Spinal Muscular Atrophy (SMA)'))   suggested.add('sma_parents');
  if (otherMed.includes('Muscular Dystrophy'))              suggested.add('muscular_dystrophy');
  if (otherMed.includes('Sickle Cell Disease'))             suggested.add('sickle_cell');
  if (otherMed.includes('Cleft Lip / Palate'))              suggested.add('cleft_lip_palate');
  if (otherMed.includes('Osteogenesis Imperfecta'))         suggested.add('osteogenesis_imperfecta');
  if (otherMed.includes('Esophageal Atresia / Tracheoesophageal Fistula (TEF)')) suggested.add('esophageal_atresia_parents');
  if (otherMed.includes('Gastroschisis / Omphalocele'))     suggested.add('pediatric_surgery_parents');
  if (otherMed.includes("Hirschsprung's Disease"))          suggested.add('hirschsprung_parents');
  if (otherMed.includes('Biliary Atresia'))                 suggested.add('biliary_atresia_parents');
  if (otherMed.includes('Short Bowel Syndrome'))            suggested.add('short_bowel_parents');
  if (otherMed.includes('Scoliosis'))                       suggested.add('scoliosis_parents');
  if (otherMed.includes('Hip Dysplasia (DDH)'))             suggested.add('hip_dysplasia_parents');

  const medEquip = answers['medical_equipment'] ?? [];
  if (medEquip.includes('Feeding tube (G-tube, NG-tube, GJ-tube, etc.)')) {
    suggested.add('tube_feeding');
    suggested.add('gtube_parents');
  }
  if (medEquip.includes('Wheelchair or power chair') || medEquip.includes('Gait trainer / adaptive walker')) {
    suggested.add('wheelchair_parents');
    const wheelDetail = answers['equipment_wheelchair_detail'] ?? [];
    if (wheelDetail.includes('Manual wheelchair'))                          suggested.add('manual_wheelchair_parents');
    if (wheelDetail.includes('Power wheelchair / power chair'))             suggested.add('power_chair_parents');
    if (wheelDetail.includes('Gait trainer / pediatric walker'))            suggested.add('gait_trainer_parents');
  }
  if (medEquip.includes('Hearing aids') || medEquip.includes('Cochlear implant')) {
    suggested.add('hearing_loss_parents');
    const hearDetail = answers['equipment_hearing_detail'] ?? [];
    if (hearDetail.includes('Hearing aids (mild to moderate hearing loss)')) suggested.add('hearing_aids_parents');
    if (hearDetail.includes('Cochlear implant — one ear') ||
        hearDetail.includes('Bilateral cochlear implants — both ears'))     suggested.add('cochlear_implant_parents');
    if (hearDetail.includes('Bone anchored hearing aid (BAHA / Osia)'))    suggested.add('baha_parents');
    if (hearDetail.includes('Profound deafness — no amplification device')) suggested.add('deaf_child_parents');
    if (hearDetail.includes('Hard of hearing — navigating without devices')) suggested.add('hard_of_hearing_parents');
  }
  if (medEquip.includes('Tracheostomy (trach)'))                           suggested.add('trach_parents');
  if (medEquip.includes('Oxygen / respiratory support') || medEquip.includes('Tracheostomy (trach)')) {
    suggested.add('oxygen_dependent_parents');
    const oxyDetail = answers['equipment_oxygen_detail'] ?? [];
    if (oxyDetail.includes('Tracheostomy (trach) — with or without vent')) suggested.add('trach_parents');
    if (oxyDetail.includes('Ventilator (vent) dependent') ||
        oxyDetail.includes('Tracheostomy (trach) — with or without vent')) suggested.add('vent_dependent_parents');
  }
  if (medEquip.includes('Communication device (AAC / speech-generating device)')) suggested.add('aac_parents');
  if (medEquip.includes('Insulin pump or CGM (continuous glucose monitor)')) {
    suggested.add('t1d_parents');
    suggested.add('cgm_pump_parents');
  }
  if (medEquip.includes('Orthotics / AFOs / leg braces / prosthetics'))   suggested.add('orthotics_parents');
  if (medEquip.includes('CPAP / BiPAP'))                                   suggested.add('cpap_bipap_parents');

  const childSurgery = answers['child_surgery'] ?? [];
  if (childSurgery.includes('Yes — already had surgery') || childSurgery.includes('Surgery scheduled / upcoming')) {
    suggested.add('pediatric_surgery_parents');
    if (childSurgery.includes('Surgery scheduled / upcoming'))             suggested.add('upcoming_surgery_parents');
    const surgeryTypes = answers['child_surgery_type'] ?? [];
    if (surgeryTypes.includes('Open heart surgery') ||
        surgeryTypes.includes('Cardiac catheterization'))                  suggested.add('open_heart_surgery_parents');
    if (surgeryTypes.includes('Brain / neurosurgery (shunt, tumor removal, etc.)') ||
        surgeryTypes.includes('Craniosynostosis repair (skull surgery)'))  suggested.add('pediatric_neurosurgery_parents');
    if (surgeryTypes.includes('Craniosynostosis repair (skull surgery)'))  suggested.add('craniosynostosis_parents');
    if (surgeryTypes.includes('Tumor or cancer surgery'))                  suggested.add('pediatric_cancer_parents');
    if (surgeryTypes.includes('Organ transplant'))                         suggested.add('organ_transplant_parents');
    if (surgeryTypes.includes('Kidney or urological surgery'))             suggested.add('kidney_condition_parents');
    // abdominal/GI surgery already captured by pediatric_surgery_parents above
  }

  const cpSub = answers['cp_subtype'] ?? [];
  if (cpSub.includes('Hemiplegia — Left Side'))   suggested.add('cp_hemiplegia_left');
  if (cpSub.includes('Hemiplegia — Right Side'))  suggested.add('cp_hemiplegia_right');
  if (cpSub.includes('Diplegia'))                 suggested.add('cp_diplegia');
  if (cpSub.includes('Quadriplegia'))             suggested.add('cp_quadriplegia');
  if (cpSub.includes('Ataxic CP'))                suggested.add('cp_ataxic');
  if (cpSub.includes('Dyskinetic / Athetoid CP')) suggested.add('cp_dyskinetic');
  const chdSub = answers['chd_type'] ?? [];
  if (chdSub.includes('HLHS (Hypoplastic Left Heart Syndrome)'))  suggested.add('chd_hlhs');
  if (chdSub.includes('Tetralogy of Fallot'))                     suggested.add('chd_tof');
  if (chdSub.includes('Transposition of the Great Arteries (TGA)')) suggested.add('chd_tga');
  if (chdSub.includes('Ventricular Septal Defect (VSD)'))         suggested.add('chd_vsd');
  if (chdSub.includes('Atrial Septal Defect (ASD)'))              suggested.add('chd_asd_heart');
  if (chdSub.includes('Coarctation of the Aorta'))                suggested.add('chd_coarctation');
  if (chdSub.includes('Pulmonary Atresia'))                       suggested.add('chd_pulmonary_atresia');
  if (chdSub.includes('AVSD (Atrioventricular Septal Defect)'))   suggested.add('chd_avsd');
  if (chdSub.includes('Other Congenital Heart Defect'))           suggested.add('chd_other');
  const status = answers['parent_status'] ?? [];
  if (status.includes('Adoptive Parent'))  suggested.add('adoptive_parents');
  if (status.includes('Step-parent'))      { suggested.add('step_parents'); suggested.add('blended_family'); }
  if (status.includes('Foster Parent'))    suggested.add('foster_parents');
  const familial = answers['familial_situation'] ?? [];
  if (familial.includes('Grandparent raising grandchild(ren)'))       suggested.add('grandparent');
  if (familial.includes('Aunt / Uncle raising nieces/nephews'))        suggested.add('aunt_uncle_raising');
  if (familial.includes('Other family member (cousin, sibling, etc.)')) suggested.add('kinship_family');
  const singleStatus = answers['single_parent'] ?? [];
  if (singleStatus.includes('Single Mom by Choice'))         suggested.add('single_mom_choice');
  if (singleStatus.includes('Single Dad by Choice'))         suggested.add('single_dad_choice');
  if (singleStatus.includes('Single Mom by Circumstance'))   suggested.add('single_mom_circumstance');
  if (singleStatus.includes('Single Dad by Circumstance'))   suggested.add('single_dad_circumstance');
  if (singleStatus.includes('Single Mom — Widowed / Loss'))  suggested.add('single_mom_loss');
  if (singleStatus.includes('Single Dad — Widowed / Loss'))  suggested.add('single_dad_loss');
  if (singleStatus.includes('Co-parenting'))                 suggested.add('coparenting');
  const lgbtq = answers['lgbtq_family'] ?? [];
  if (lgbtq.some(l => l !== 'None of these')) suggested.add('lgbtq');
  if (lgbtq.includes('Gay Dads'))                            suggested.add('gay_dads');
  if (lgbtq.includes('Lesbian Moms'))                        suggested.add('lesbian_moms');
  if (lgbtq.includes('Queer / Non-Binary Parent(s)'))        suggested.add('queer_parents');
  if (lgbtq.includes('Same-sex couple'))                     suggested.add('same_sex_parents');
  if (lgbtq.includes('Transgender Parent'))                  suggested.add('trans_parents');
  const military = answers['military_family'] ?? [];
  if (military.some(m => m !== 'None of these')) suggested.add('military');
  if (military.includes('Military Mom (Active Duty)'))              suggested.add('military_mom');
  if (military.includes('Military Dad (Active Duty)'))              suggested.add('military_dad');
  if (military.includes('Spouse / Partner of Military Member'))     suggested.add('military_spouse_parent');
  if (military.includes('Veteran Parent'))                          suggested.add('veteran_parent');
  if (military.includes('National Guard / Reserve Parent'))         suggested.add('national_guard_parent');
  const fertility = answers['fertility_treatments'] ?? [];
  if (fertility.includes('IVF'))                                       suggested.add('ivf_parents');
  if (fertility.includes('IUI'))                                       suggested.add('iui_parents');
  if (fertility.includes('Donor Egg / Sperm') || fertility.includes('Embryo Donation')) suggested.add('donor_conception');
  if (fertility.includes('Surrogacy'))                                 { suggested.add('surrogacy_parents'); suggested.add('intended_parents'); }
  // Feeding method routing
  const feedingMethod = answers['feeding_method'] ?? [];
  if (feedingMethod.includes('Breastfeeding')) {
    suggested.add('breastfeeding');
    const bfDetail = answers['breastfeeding_detail'] ?? [];
    if (bfDetail.includes('Over supplier'))                    suggested.add('breastfeeding_oversupply');
    if (bfDetail.includes('Just enougher'))                    suggested.add('breastfeeding_just_enough');
    if (bfDetail.includes('Low supply / Under supplier'))      suggested.add('breastfeeding_low_supply');
    if (bfDetail.includes('Extended breastfeeding (1+ year)')) suggested.add('extended_breastfeeding');
    if (bfDetail.includes('Weaning'))                          suggested.add('weaning');
    if (bfDetail.includes('Nursing strike'))                   suggested.add('nursing_strike');
  }
  if (feedingMethod.includes('Formula feeding')) {
    suggested.add('formula_feeding');
    const fDetail = answers['formula_detail'] ?? [];
    if (fDetail.includes('Specialty formula needed'))                          suggested.add('specialty_formula');
    if (fDetail.includes('Hypoallergenic formula (e.g. Nutramigen, Alimentum)')) suggested.add('hypoallergenic_formula');
    if (fDetail.includes('Amino acid formula (e.g. Elecare, Neocate)'))       suggested.add('amino_acid_formula');
    if (fDetail.includes('Donor breast milk'))                                 suggested.add('donor_milk');
  }
  if (feedingMethod.includes('Exclusive pumping')) {
    suggested.add('exclusive_pumping');
    const epDetail = answers['pumping_detail'] ?? [];
    if (epDetail.includes('Over supplier'))               suggested.add('ep_oversupply');
    if (epDetail.includes('Just enougher'))               suggested.add('ep_just_enough');
    if (epDetail.includes('Low supply / Under supplier')) suggested.add('ep_low_supply');
  }
  if (feedingMethod.includes('Combination feeding')) suggested.add('combination_feeding');
  if (feedingMethod.includes('Tube feeding (G-tube, GJ-tube, NG-tube)')) {
    suggested.add('tube_feeding');
    const tubeDetail = answers['tube_feeding_detail'] ?? [];
    if (tubeDetail.includes('G-tube (gastrostomy tube)'))            suggested.add('gtube_parents');
    if (tubeDetail.includes('GJ-tube (gastrojejunostomy tube)'))     suggested.add('gjtube_parents');
    if (tubeDetail.includes('NG-tube (nasogastric tube)'))           suggested.add('ngtube_parents');
    if (tubeDetail.includes('Transitioning off tube feeding'))       suggested.add('tube_transitioning');
  }
  if (feedingMethod.includes('Eating solids')) {
    const solidsDetail = answers['solids_detail'] ?? [];
    if (solidsDetail.includes('Just starting solids (4–6 months)')) suggested.add('starting_solids');
    if (solidsDetail.includes('Baby-led weaning (BLW)'))            suggested.add('baby_led_weaning');
    if (solidsDetail.includes('Puree / spoon feeding'))             suggested.add('puree_feeding');
    if (solidsDetail.includes('Food allergies / intolerances'))     suggested.add('food_allergies');
    if (solidsDetail.includes('Extreme picky eating'))              suggested.add('picky_eater');
    if (solidsDetail.includes('Oral aversion / food refusal'))      suggested.add('oral_aversion');
  }
  // Challenges — categorized drill-down
  const challengesFeedingDetail = answers['challenges_feeding_detail'] ?? [];
  if (challengesFeedingDetail.includes('ARFID (Avoidant / Restrictive Food Intake Disorder)')) suggested.add('arfid_parents');
  if (challengesFeedingDetail.includes('Tube weaning'))             suggested.add('tube_weaning');
  if (challengesFeedingDetail.includes('Feeding therapy'))          suggested.add('feeding_therapy');
  if (challengesFeedingDetail.includes('Oral aversion / food refusal')) suggested.add('oral_aversion');
  if (challengesFeedingDetail.includes('Failure to thrive / growth concerns')) suggested.add('failure_to_thrive');
  const challengesSleepDetail = answers['challenges_sleep_detail'] ?? [];
  if (challengesSleepDetail.includes('Sleep training'))             suggested.add('sleep_training');
  if (challengesSleepDetail.includes('Night waking / wakeful sleeper')) suggested.add('night_waking');
  if (challengesSleepDetail.includes('Sleep regressions'))          suggested.add('sleep_regression');
  if (challengesSleepDetail.includes('Co-sleeping / bedsharing'))   suggested.add('cosleeping');
  if (challengesSleepDetail.includes('Early rising'))               suggested.add('early_rising');
  if (challengesSleepDetail.includes('Night terrors / nightmares')) suggested.add('night_terrors');

  const sleepChallenges = answers['sleep_challenges'] ?? [];
  if (sleepChallenges.includes('Difficulty falling asleep / sleep onset struggles')) suggested.add('sleep_onset_parents');
  if (sleepChallenges.includes('Frequent night wakings'))                            suggested.add('night_waking');
  if (sleepChallenges.includes('Early morning waking (before 6am)'))                suggested.add('early_rising');
  if (sleepChallenges.includes('Short naps / nap refusal'))                         suggested.add('nap_refusal_parents');
  if (sleepChallenges.includes('Sleep regressions'))                                suggested.add('sleep_regression');
  if (sleepChallenges.includes('Night terrors or nightmares'))                      suggested.add('night_terrors');
  if (sleepChallenges.includes('Currently sleep training (or recently completed)')) {
    suggested.add('sleep_training');
    const method = answers['sleep_training_method'] ?? [];
    if (method.includes('Ferber method / graduated extinction'))                    suggested.add('ferber_parents');
    if (method.includes('Full extinction / Cry It Out (CIO)'))                     suggested.add('cio_parents');
    if (method.includes('Chair method / Sleep Lady Shuffle') ||
        method.includes('Pick Up Put Down (PUPD)') ||
        method.includes('No Cry Sleep Solution') ||
        method.includes('Gentle / attachment-based approach'))                      suggested.add('gentle_sleep_parents');
    if (method.includes('Working with a sleep consultant'))                         suggested.add('sleep_consultant_parents');
  }
  if (sleepChallenges.includes('Co-sleeping / bedsharing')) {
    suggested.add('cosleeping');
    const cosleepDetail = answers['sleep_cosleeping_detail'] ?? [];
    if (cosleepDetail.includes('Intentional bedsharing (same bed, by choice)'))    suggested.add('bedsharing_parents');
    if (cosleepDetail.includes('Room sharing — baby on a separate surface in our room')) suggested.add('room_sharing_parents');
  }
  const challengesBehaviorDetail = answers['challenges_behavior_detail'] ?? [];
  if (challengesBehaviorDetail.includes('Tantrums & meltdowns'))    suggested.add('tantrum_support');
  if (challengesBehaviorDetail.includes('Oppositional behavior (ODD)')) suggested.add('odd_parents');
  if (challengesBehaviorDetail.includes('Aggression'))              suggested.add('behavior_support');
  if (challengesBehaviorDetail.includes('ABA therapy journey'))     suggested.add('aba_parents');
  if (challengesBehaviorDetail.includes('Child anxiety'))           suggested.add('child_anxiety');
  if (challengesBehaviorDetail.includes('School refusal'))          suggested.add('school_refusal');
  if (challengesBehaviorDetail.includes('Self-injurious behavior')) suggested.add('self_injury_parents');
  const challengesMedicalDetail = answers['challenges_medical_detail'] ?? [];
  if (challengesMedicalDetail.includes('High appointment load (10+ per year)')) suggested.add('high_medical_needs');
  if (challengesMedicalDetail.includes('Multiple therapies (OT, PT, SLP, etc.)')) suggested.add('multiple_therapies');
  if (challengesMedicalDetail.includes('Awaiting a diagnosis'))     suggested.add('pending_diagnosis');
  if (challengesMedicalDetail.includes('Medically complex / fragile child')) suggested.add('medically_complex');
  if (challengesMedicalDetail.includes('Home health nursing involved'))      suggested.add('home_health_nursing');
  const challengesChildcareDetail = answers['challenges_childcare_detail'] ?? [];
  if (challengesChildcareDetail.includes('Finding childcare for a child with special needs')) suggested.add('special_needs_childcare');
  if (challengesChildcareDetail.includes('Finding an inclusive daycare or school')) suggested.add('inclusive_childcare');
  if (challengesChildcareDetail.includes('Long waitlists / no availability')) suggested.add('childcare_waitlist');
  if (challengesChildcareDetail.includes('Caregiver burnout'))      suggested.add('caregiver_burnout');
  const challengesFinancialDetail = answers['challenges_financial_detail'] ?? [];
  if (challengesFinancialDetail.length > 0)                        suggested.add('financial_strain_parents');
  if (challengesFinancialDetail.includes('SSI / disability benefits navigation') ||
      challengesFinancialDetail.includes('FMLA / disability leave navigation'))   suggested.add('insurance_navigation');
  const challengesIsolationDetail = answers['challenges_isolation_detail'] ?? [];
  if (challengesIsolationDetail.length > 0)                        suggested.add('isolated_parents');
  const challengesSystemsDetail = answers['challenges_systems_detail'] ?? [];
  if (challengesSystemsDetail.includes('IEP / special education at school'))  suggested.add('iep_parents');
  if (challengesSystemsDetail.length > 0)                          suggested.add('systems_navigation');
  const challengesDevDetail = answers['challenges_development_detail'] ?? [];
  if (challengesDevDetail.includes('Speech delay'))                 suggested.add('speech_delay');
  if (challengesDevDetail.includes('Developmental delay'))          suggested.add('developmental_delay');
  if (challengesDevDetail.includes('Gross motor / walking delays'))  suggested.add('gross_motor_delay');
  if (challengesDevDetail.includes('Potty training struggles'))     suggested.add('potty_training');
  if (challengesDevDetail.includes('Gifted child / twice exceptional')) suggested.add('gifted_parents');

  const childTherapy = answers['child_therapy'] ?? [];
  const hasPrivate = childTherapy.includes('Yes — private therapy outside of school') ||
                     childTherapy.includes('Both private and school-based therapy');
  if (hasPrivate) {
    suggested.add('private_therapy_parents');
    const privateTypes = answers['child_therapy_private_types'] ?? [];
    if (privateTypes.includes('Speech-Language Therapy (SLP)'))             suggested.add('slp_therapy_parents');
    if (privateTypes.includes('Occupational Therapy (OT)'))                 suggested.add('ot_therapy_parents');
    if (privateTypes.includes('Physical Therapy (PT)'))                     suggested.add('pt_therapy_parents');
    if (privateTypes.includes('ABA (Applied Behavior Analysis)'))           suggested.add('aba_parents');
    if (privateTypes.includes('Feeding therapy'))                           suggested.add('feeding_therapy');
    if (privateTypes.includes('Vision therapy'))                            suggested.add('vision_therapy_parents');
    if (privateTypes.includes('Child psychologist / mental health therapy') ||
        privateTypes.includes('Play therapy'))                              suggested.add('child_mental_health_therapy');
    if (privateTypes.includes('Social skills group'))                       suggested.add('social_skills_therapy_parents');
    if (privateTypes.includes('Aquatic therapy') ||
        privateTypes.includes('Hippotherapy / equine therapy'))             suggested.add('aquatic_hippotherapy_parents');
  }
  if (childTherapy.includes('Both private and school-based therapy'))       suggested.add('multiple_therapies');
  if (childTherapy.includes('School-based services only (IEP / IFSP)'))    suggested.add('school_services_only_parents');
  if (childTherapy.includes('On a waitlist for therapy'))                   suggested.add('therapy_waitlist_parents');
  if (childTherapy.includes('We completed therapy / graduated'))            suggested.add('therapy_graduate_parents');

  const schoolType = answers['school_type'] ?? [];
  if (schoolType.includes('Public school (K–12)')) {
    suggested.add('public_school_parents');
    const pubDetail = answers['school_public_detail'] ?? [];
    if (pubDetail.includes('IEP — special education services') ||
        pubDetail.includes('Inclusion classroom (general ed with supports)') ||
        pubDetail.includes('Self-contained special education classroom'))   suggested.add('iep_parents');
    if (pubDetail.includes('Magnet school'))                               suggested.add('magnet_school_parents');
    if (pubDetail.includes('Charter school'))                              suggested.add('charter_school_parents');
    if (pubDetail.includes('Title I / high-need school'))                  suggested.add('title_one_school_parents');
    if (pubDetail.includes('Virtual / online public school'))              suggested.add('virtual_school_parents');
  }
  if (schoolType.includes('Private school (K–12)')) {
    suggested.add('private_school_parents');
    const privDetail = answers['school_private_detail']?.[0];
    if (privDetail === 'Faith-based / religious school')                   suggested.add('faith_based_school_parents');
    if (privDetail === 'Montessori school')                                suggested.add('montessori_parents');
    if (privDetail === 'Waldorf school')                                   suggested.add('waldorf_parents');
    if (privDetail === 'Private special education school')                 suggested.add('private_sped_school_parents');
  }
  if (schoolType.includes('Homeschool / Home education')) {
    suggested.add('homeschool_parents');
    const hsDetail = answers['school_homeschool_detail'] ?? [];
    if (hsDetail.includes('Classical education'))                          suggested.add('classical_homeschool_parents');
    if (hsDetail.includes('Charlotte Mason method'))                       suggested.add('charlotte_mason_parents');
    if (hsDetail.includes('Unschooling / child-led learning'))             suggested.add('unschooling_parents');
    if (hsDetail.includes('Homeschool co-op'))                             suggested.add('homeschool_coop_parents');
    if (hsDetail.includes('Homeschooling due to special needs or medical needs')) suggested.add('homeschool_special_needs_parents');
  }
  if (schoolType.includes('Preschool / Pre-K program'))                   suggested.add('preschool_parents');
  if (schoolType.includes('Daycare / Childcare center') ||
      schoolType.includes('Preschool / Pre-K program') ||
      schoolType.includes('In-home childcare (nanny, au pair, or family member)')) {
    suggested.add('daycare_parents');
    const careDetail = answers['school_childcare_detail']?.[0];
    if (careDetail === 'Small home daycare / family childcare')            suggested.add('family_daycare_parents');
    if (careDetail === 'Faith-based / church daycare or preschool')        suggested.add('faith_based_childcare_parents');
    if (careDetail === 'Head Start / Early Head Start program')            suggested.add('head_start_parents');
    if (careDetail === 'Montessori preschool')                             suggested.add('montessori_parents');
    if (careDetail === 'Military CDC (Child Development Center)')           suggested.add('military_cdc_parents');
    if (careDetail === 'Nanny (in-home caregiver)' ||
        careDetail === 'Au pair' ||
        careDetail === 'Grandparent or family member')                     suggested.add('nanny_aupair_parents');
  }
  if (schoolType.includes('Not in school or childcare yet'))               suggested.add('home_with_parent_parents');

  const iep504 = answers['iep_504'] ?? [];
  if (iep504.includes('IEP (Individualized Education Program)')) {
    suggested.add('iep_parents');
    const iepDetail = answers['iep_services_detail'] ?? [];
    if (iepDetail.includes('Speech-Language (SLP) services'))              suggested.add('iep_speech_parents');
    if (iepDetail.includes('Occupational Therapy (OT) services'))          suggested.add('iep_ot_parents');
    if (iepDetail.includes('Physical Therapy (PT) services'))              suggested.add('iep_pt_parents');
    if (iepDetail.includes('Behavioral support / Behavior Intervention Plan (BIP)')) suggested.add('iep_behavioral_parents');
    if (iepDetail.includes('Autism services'))                             suggested.add('iep_autism_services_parents');
  }
  if (iep504.includes('504 Plan')) {
    suggested.add('504_plan_parents');
    const planDetail = answers['iep_504_plan_detail'] ?? [];
    if (planDetail.includes('ADHD-related accommodations (extra time, movement breaks, etc.)')) suggested.add('504_adhd_parents');
    if (planDetail.includes('Anxiety or mental health needs'))             suggested.add('504_anxiety_parents');
    if (planDetail.includes('Physical or medical needs (diabetes, seizures, allergies, etc.)')) suggested.add('504_medical_parents');
  }
  if (iep504.includes('Early Intervention (under age 3 — Part C)'))       suggested.add('early_intervention_parents');
  if (iep504.includes('In process of getting an evaluation') ||
      iep504.includes("My child was denied — I'm fighting for services")) {
    suggested.add('iep_process_parents');
    const processDetail = answers['iep_process_detail'] ?? [];
    if (processDetail.includes('Navigating a denial or disagreement with the school') ||
        processDetail.includes('Filing a complaint or going to due process') ||
        iep504.includes("My child was denied — I'm fighting for services")) suggested.add('iep_denial_parents');
  }
  if (iep504.includes('Neither — general education'))                       suggested.add('gen_ed_parents');

  if (answers['parent_age_range']?.[0] === 'Under 20') suggested.add('teen_parent');

  const workStatus = answers['work_status']?.[0];
  if (workStatus === 'Yes — full time' || workStatus === 'Yes — part time') suggested.add('working_mom');
  if (workStatus === 'Yes — part time')                                     suggested.add('part_time_working_parents');
  if (workStatus === 'On leave / between jobs')                             suggested.add('on_leave_parents');
  if (workStatus === "No — I'm a stay at home parent") {
    suggested.add('sahp');
    const sahpDetail = answers['work_sahp_detail'] ?? [];
    if (sahpDetail.includes('By choice — preferred arrangement'))           suggested.add('sahp_by_choice');
    if (sahpDetail.includes('Due to childcare costs'))                      suggested.add('sahp_childcare_cost_parents');
    if (sahpDetail.includes("Due to child's medical or special needs"))     suggested.add('sahp_special_needs');
    if (sahpDetail.includes('Planning to return to work soon') ||
        sahpDetail.includes('Recently transitioned / new to SAHP life'))   suggested.add('sahp_returning_to_work');
  }

  const workSituation = answers['work_situation'] ?? [];
  if (workSituation.includes('Night shift worker')) {
    suggested.add('night_shift_parents');
    const nightDetail = answers['work_night_detail'] ?? [];
    if (nightDetail.includes('Healthcare / Hospital'))                       suggested.add('night_shift_healthcare');
    if (nightDetail.includes('Hospitality / Food & beverage service'))       suggested.add('night_shift_hospitality');
    if (nightDetail.includes('Security / Law enforcement'))                  suggested.add('law_enforcement_parents');
    if (nightDetail.includes('Transportation / Logistics'))                  suggested.add('night_shift_transport');
    if (nightDetail.includes('Factory / Warehouse'))                         suggested.add('night_shift_factory');
  }
  if (workSituation.includes('Healthcare worker')) {
    suggested.add('healthcare_worker_parents');
    const healthcareDetail = answers['work_healthcare_detail'] ?? [];
    if (healthcareDetail.includes('Registered Nurse (RN)') ||
        healthcareDetail.includes('LPN / CNA / Medical aide'))               suggested.add('nurse_parents');
    if (healthcareDetail.includes('Doctor / Physician / Surgeon'))           suggested.add('doctor_parents');
    if (healthcareDetail.includes('Paramedic / EMT / First Responder'))      suggested.add('paramedic_parents');
    if (healthcareDetail.includes('Mental health professional (therapist, counselor, psychologist)')) suggested.add('mental_health_pro_parents');
    if (healthcareDetail.includes('Physical / Occupational / Speech Therapist')) suggested.add('therapist_parents');
    if (healthcareDetail.includes('Pharmacist'))                             suggested.add('pharmacist_parents');
    if (healthcareDetail.includes('Medical admin / Support staff'))          suggested.add('medical_admin_parents');
  }
  if (workSituation.includes('Teacher / Educator')) {
    suggested.add('teacher_parents');
    const teacherDetail = answers['work_teacher_detail'] ?? [];
    if (teacherDetail.includes('Early childhood / Preschool'))               suggested.add('early_childhood_educator_parents');
    if (teacherDetail.includes('Elementary school (K–5)'))                   suggested.add('elementary_teacher_parents');
    if (teacherDetail.includes('Middle school (6–8)'))                       suggested.add('middle_school_teacher_parents');
    if (teacherDetail.includes('High school (9–12)'))                        suggested.add('high_school_teacher_parents');
    if (teacherDetail.includes('Special education'))                         suggested.add('special_ed_teacher_parents');
    if (teacherDetail.includes('College / University'))                      suggested.add('college_educator_parents');
    if (teacherDetail.includes('Instructional aide / Paraprofessional'))     suggested.add('paraprofessional_parents');
  }
  if (workSituation.includes('Work from home / Remote')) {
    suggested.add('wfh_parents');
    const wfhDetail = answers['work_wfh_detail'] ?? [];
    if (wfhDetail.includes('Remote employee (company job done remotely)'))   suggested.add('remote_employee_parents');
    if (wfhDetail.includes('Freelancer / Independent contractor'))           suggested.add('freelance_parents');
    if (wfhDetail.includes('Entrepreneur / Business owner'))                 suggested.add('entrepreneur_parents');
    if (wfhDetail.includes('Content creator / Influencer'))                  suggested.add('content_creator_parents');
    if (wfhDetail.includes('Home childcare provider / Home daycare'))        suggested.add('home_daycare_parents');
  }
  if (workSituation.includes('Self-employed / Entrepreneur / Business owner')) {
    suggested.add('entrepreneur_parents');
    const selfEmpDetail = answers['work_selfemployed_detail'] ?? [];
    if (selfEmpDetail.includes('Small business owner (local / brick & mortar)')) suggested.add('small_business_parents');
    if (selfEmpDetail.includes('Online business / e-commerce'))              suggested.add('entrepreneur_parents');
    if (selfEmpDetail.includes('Freelancer / Independent contractor'))       suggested.add('freelance_parents');
    if (selfEmpDetail.includes('Content creator / Influencer / Blogger'))   suggested.add('content_creator_parents');
  }
  if (workSituation.includes('Working multiple jobs')) {
    suggested.add('multiple_jobs_parents');
    const multipleJobsDetail = answers['work_multiple_jobs_detail'] ?? [];
    if (multipleJobsDetail.includes('Gig work / Rideshare / Delivery') ||
        multipleJobsDetail.includes('Side hustle alongside main job'))       suggested.add('gig_economy_parents');
  }

  const insuranceType = answers['insurance_type'] ?? [];
  if (insuranceType.includes('Medicaid / CHIP')) {
    suggested.add('medicaid_families');
    const medicaidDetail = answers['insurance_medicaid_detail'] ?? [];
    if (medicaidDetail.includes('Medicaid for my child (CHIP)'))            suggested.add('chip_families');
    if (medicaidDetail.includes('Medicaid denials or appeals') ||
        medicaidDetail.includes('Finding Medicaid-accepting providers'))     suggested.add('insurance_navigation');
    if (medicaidDetail.includes('Transitioning off Medicaid due to income changes') ||
        medicaidDetail.includes('Medicaid renewals / redeterminations'))    suggested.add('medicaid_transitions');
  }
  if (insuranceType.includes('Private insurance (employer or marketplace)')) {
    suggested.add('private_insurance_parents');
    const privateDetail = answers['insurance_private_detail'] ?? [];
    if (privateDetail.includes('ACA / Marketplace plan'))                   suggested.add('aca_marketplace_parents');
    if (privateDetail.includes('Insurance denials for therapy or treatments') ||
        privateDetail.includes('Out-of-network providers or costs'))        suggested.add('insurance_navigation');
    if (privateDetail.includes('COBRA / between jobs coverage'))            suggested.add('cobra_parents');
  }
  if (insuranceType.includes('TRICARE (military)')) {
    suggested.add('tricare_families');
    const tricareDetail = answers['insurance_tricare_detail'] ?? [];
    if (tricareDetail.includes('TRICARE ECHO (Extended Care Health Option — for special needs)')) suggested.add('tricare_echo_families');
  }
  if (insuranceType.includes('Uninsured / No coverage')) {
    suggested.add('uninsured_parents');
    const uninsuredDetail = answers['insurance_uninsured_detail'] ?? [];
    if (uninsuredDetail.includes('Applying for Medicaid or CHIP'))          suggested.add('medicaid_families');
    if (uninsuredDetail.includes('Free clinic or community health resources')) suggested.add('community_health_parents');
  }
  if (insuranceType.includes('Medicaid waiver')) {
    suggested.add('medicaid_waiver_families');
    const waiverDetail = answers['insurance_waiver_detail'] ?? [];
    if (waiverDetail.includes('HCBS (Home and Community-Based Services) waiver')) suggested.add('hcbs_waiver_families');
    if (waiverDetail.includes('Katie Beckett / TEFRA waiver'))              suggested.add('katie_beckett_families');
    if (waiverDetail.includes('DD (Developmental Disabilities) waiver'))    suggested.add('dd_waiver_families');
    if (waiverDetail.includes('Autism waiver'))                             suggested.add('autism_waiver_families');
    if (waiverDetail.includes('Technology-Assisted waiver (vent / medical equipment)')) suggested.add('tech_assisted_waiver_families');
    if (waiverDetail.includes('On the waiver waitlist'))                    suggested.add('waiver_waitlist_families');
  }

  const supportNetwork = answers['support_network'] ?? [];
  if (supportNetwork.includes('Strong local family support'))               suggested.add('strong_support_parents');
  if (supportNetwork.includes('Limited local support')) {
    suggested.add('isolated_parents');
    const limitedDetail = answers['support_limited_detail'] ?? [];
    if (limitedDetail.includes('Recently relocated / new to the area'))     suggested.add('recently_relocated_parents');
    if (limitedDetail.includes('Estranged from family'))                    suggested.add('estranged_family_parents');
    if (limitedDetail.includes("Family doesn't understand my child's needs")) suggested.add('family_doesnt_get_it_parents');
    if (limitedDetail.includes('Rural or remote area'))                     suggested.add('rural_parents');
    if (limitedDetail.includes('Everyone is too busy / schedules never align')) suggested.add('schedule_conflict_parents');
  }
  if (supportNetwork.includes('No local family — friends are my village')) {
    suggested.add('chosen_family_parents');
  }
  if (supportNetwork.includes('Completely isolated / no support network')) {
    suggested.add('isolated_parents');
    const isolatedDetail = answers['support_isolated_detail'] ?? [];
    if (isolatedDetail.includes('Recently relocated / no roots here yet'))  suggested.add('recently_relocated_parents');
    if (isolatedDetail.includes('Postpartum depression or mental health challenges')) suggested.add('ppd_isolation_parents');
    if (isolatedDetail.includes("Child's complex needs limit outings and activities")) suggested.add('caregiver_burnout');
    if (isolatedDetail.includes('Rural or remote location'))                suggested.add('rural_parents');
    if (isolatedDetail.includes('Partner works away or travels frequently')) suggested.add('partner_travels_parents');
    if (isolatedDetail.includes('Grief or major life transition'))           suggested.add('grief_transition_parents');
  }
  if (supportNetwork.includes('Long-distance family support only')) {
    suggested.add('long_distance_family_parents');
    const longDistanceDetail = answers['support_long_distance_detail'] ?? [];
    if (longDistanceDetail.includes('Recently relocated / no roots here yet') ||
        longDistanceDetail.includes('Moved for work or partner\'s career'))  suggested.add('recently_relocated_parents');
    if (longDistanceDetail.includes('Immigrated away from home country'))    suggested.add('immigrant_expat_parents');
    if (longDistanceDetail.includes('Primary support is virtual (video calls, texts)')) suggested.add('virtual_support_parents');
  }

  const religion = answers['religion'] ?? [];
  if (religion.includes('Christian (Protestant)')) {
    suggested.add('christian_parents');
    const christianDetail = answers['religion_christian_detail'] ?? [];
    if (christianDetail.includes('Evangelical'))                            suggested.add('evangelical_parents');
    if (christianDetail.includes('Baptist'))                                suggested.add('baptist_parents');
    if (christianDetail.includes('Pentecostal / Charismatic'))              suggested.add('pentecostal_parents');
    if (christianDetail.includes('Non-denominational'))                     suggested.add('nondenominational_parents');
    if (christianDetail.includes('Methodist / Wesleyan'))                   suggested.add('methodist_parents');
    if (christianDetail.includes('Lutheran'))                               suggested.add('lutheran_parents');
    if (christianDetail.includes('Episcopal / Anglican'))                   suggested.add('episcopal_parents');
    if (christianDetail.includes('Reformed / Presbyterian'))                suggested.add('reformed_parents');
    if (christianDetail.includes('Seventh-day Adventist'))                  suggested.add('sda_parents');
  }
  if (religion.includes('Catholic')) {
    suggested.add('catholic_parents');
    const catholicDetail = answers['religion_catholic_detail']?.[0];
    if (catholicDetail === 'Traditional / Latin Mass Catholic')             suggested.add('traditional_catholic_parents');
    if (catholicDetail === 'Cultural Catholic')                             suggested.add('cultural_catholic_parents');
    if (catholicDetail === 'Navigating disagreements with the Church')      suggested.add('questioning_catholic_parents');
    if (catholicDetail === 'Faith transition away from Catholicism')        suggested.add('faith_transition_parents');
  }
  if (religion.includes('Jewish')) {
    suggested.add('jewish_parents');
    const jewishDetail = answers['religion_jewish_detail']?.[0];
    if (jewishDetail === 'Orthodox' || jewishDetail === 'Modern Orthodox')  suggested.add('orthodox_jewish_parents');
    if (jewishDetail === 'Conservative / Masorti')                          suggested.add('conservative_jewish_parents');
    if (jewishDetail === 'Reform / Progressive')                            suggested.add('reform_jewish_parents');
    if (jewishDetail === 'Reconstructionist / Renewal')                     suggested.add('reconstructionist_jewish_parents');
    if (jewishDetail === 'Cultural / Secular Jewish')                       suggested.add('cultural_jewish_parents');
  }
  if (religion.includes('Muslim')) {
    suggested.add('muslim_parents');
    const muslimDetail = answers['religion_muslim_detail']?.[0];
    if (muslimDetail === 'Sunni')                                           suggested.add('sunni_parents');
    if (muslimDetail === 'Shia')                                            suggested.add('shia_parents');
    if (muslimDetail === 'Sufi')                                            suggested.add('sufi_parents');
    if (muslimDetail === 'Ahmadiyya')                                       suggested.add('ahmadiyya_parents');
    if (muslimDetail === 'Cultural / non-practicing Muslim')                suggested.add('cultural_muslim_parents');
  }
  if (religion.includes('Hindu'))                                           suggested.add('hindu_parents');
  if (religion.includes('Buddhist'))                                        suggested.add('buddhist_parents');
  if (religion.includes('Sikh'))                                            suggested.add('sikh_parents');
  if (religion.includes('Latter-day Saint (Mormon / LDS)')) {
    suggested.add('lds_parents');
    const ldsDetail = answers['religion_lds_detail']?.[0];
    if (ldsDetail === 'Cultural / less active LDS')                        suggested.add('cultural_lds_parents');
    if (ldsDetail === 'Navigating a faith transition')                      suggested.add('lds_faith_transition_parents');
    if (ldsDetail === 'LGBTQ+ LDS family')                                  { suggested.add('lds_faith_transition_parents'); suggested.add('queer_parents'); }
  }
  if (religion.includes('Orthodox Christian')) {
    suggested.add('orthodox_christian_parents');
    const orthodoxDetail = answers['religion_orthodox_detail']?.[0];
    if (orthodoxDetail === 'Greek Orthodox')                                suggested.add('greek_orthodox_parents');
    if (orthodoxDetail === 'Russian Orthodox')                              suggested.add('russian_orthodox_parents');
    if (orthodoxDetail === 'Coptic Orthodox')                               suggested.add('coptic_parents');
    if (orthodoxDetail === 'Ethiopian Orthodox')                            suggested.add('ethiopian_orthodox_parents');
    if (orthodoxDetail === 'Antiochian Orthodox')                           suggested.add('antiochian_orthodox_parents');
    if (orthodoxDetail === 'Serbian / Bulgarian / Romanian Orthodox')       suggested.add('slavic_orthodox_parents');
  }
  if (religion.includes("Jehovah's Witness"))                              suggested.add('jw_parents');
  if (religion.includes('Pagan / Wiccan / Earth-based spirituality'))      suggested.add('pagan_parents');
  if (religion.includes('Spiritual but not religious'))                     suggested.add('spiritual_nr_parents');
  if (religion.includes('Non-religious / Secular / Atheist / Agnostic'))   suggested.add('secular_parents');
  if (religion.includes('Interfaith / Multiple traditions in our household')) suggested.add('interfaith_parents');

  const homeLangs = answers['home_language'] ?? [];
  if (homeLangs.includes('Spanish')) {
    suggested.add('spanish_speaking_parents');
    const spanishDetail = answers['language_spanish_detail']?.[0];
    if (spanishDetail === 'Mexican / Mexican-American')                     suggested.add('mexican_american_parents');
    if (spanishDetail === 'Puerto Rican')                                   suggested.add('puerto_rican_parents');
    if (spanishDetail === 'Cuban')                                          suggested.add('cuban_parents');
    if (spanishDetail === 'Dominican')                                      suggested.add('dominican_parents');
    if (spanishDetail?.startsWith('Central American'))                      suggested.add('central_american_parents');
    if (spanishDetail?.startsWith('Colombian'))                             suggested.add('south_american_parents');
    if (spanishDetail?.startsWith('Castilian'))                             suggested.add('spain_spanish_parents');
  }
  if (homeLangs.includes('Mandarin Chinese'))                               suggested.add('mandarin_speaking_parents');
  if (homeLangs.includes('Cantonese Chinese'))                              suggested.add('cantonese_speaking_parents');
  if (homeLangs.includes('Arabic')) {
    suggested.add('arabic_speaking_parents');
    const arabicDetail = answers['language_arabic_detail']?.[0];
    if (arabicDetail === 'Egyptian')                                        suggested.add('arabic_egyptian_parents');
    if (arabicDetail?.startsWith('Levantine'))                              suggested.add('arabic_levantine_parents');
    if (arabicDetail?.startsWith('Gulf'))                                   suggested.add('arabic_gulf_parents');
    if (arabicDetail?.startsWith('Maghrebi'))                               suggested.add('arabic_maghrebi_parents');
    if (arabicDetail === 'Iraqi')                                           suggested.add('iraqi_parents');
    if (arabicDetail?.startsWith('Sudanese'))                               suggested.add('sudanese_parents');
  }
  if (homeLangs.includes('Hindi'))                                          suggested.add('hindi_speaking_parents');
  if (homeLangs.includes('French'))                                         suggested.add('french_speaking_parents');
  if (homeLangs.includes('Portuguese')) {
    suggested.add('portuguese_speaking_parents');
    const ptDetail = answers['language_portuguese_detail']?.[0];
    if (ptDetail === 'Brazilian')                                           suggested.add('brazilian_portuguese_parents');
    if (ptDetail === 'European (Portugal)')                                 suggested.add('european_portuguese_parents');
    if (ptDetail?.startsWith('African'))                                    suggested.add('african_portuguese_parents');
  }
  if (homeLangs.includes('Tagalog / Filipino'))                             suggested.add('tagalog_speaking_parents');
  if (homeLangs.includes('Vietnamese'))                                     suggested.add('vietnamese_speaking_parents');
  if (homeLangs.includes('Korean'))                                         suggested.add('korean_speaking_parents');
  if (homeLangs.includes('Japanese'))                                       suggested.add('japanese_speaking_parents');
  if (homeLangs.includes('Russian'))                                        suggested.add('russian_speaking_parents');
  if (homeLangs.includes('American Sign Language (ASL)'))                   suggested.add('asl_parents');
  if (homeLangs.includes('Italian'))                                        suggested.add('italian_speaking_parents');
  if (homeLangs.includes('German'))                                         suggested.add('german_speaking_parents');
  if (homeLangs.includes('Haitian Creole'))                                 suggested.add('haitian_creole_parents');
  if (homeLangs.includes('Punjabi'))                                        suggested.add('punjabi_speaking_parents');
  if (homeLangs.includes('Urdu'))                                           suggested.add('urdu_speaking_parents');
  if (homeLangs.includes('Bengali'))                                        suggested.add('bengali_speaking_parents');
  if (homeLangs.includes('Tamil'))                                          suggested.add('tamil_speaking_parents');
  if (homeLangs.includes('Farsi / Persian'))                                suggested.add('farsi_speaking_parents');
  if (homeLangs.includes('Polish'))                                         suggested.add('polish_speaking_parents');
  if (homeLangs.includes('Ukrainian'))                                      suggested.add('ukrainian_speaking_parents');
  if (homeLangs.includes('Swahili'))                                        suggested.add('swahili_speaking_parents');
  if (homeLangs.includes('Yoruba'))                                         suggested.add('yoruba_speaking_parents');
  if (homeLangs.includes('Amharic'))                                        suggested.add('amharic_speaking_parents');
  const multilingualPlan = answers['language_multilingual']?.[0];
  if (multilingualPlan === 'Yes — intentionally raising bilingual / multilingual children' ||
      multilingualPlan === 'Working on it / hoping to' ||
      multilingualPlan === 'One language at home, learning another outside') suggested.add('bilingual_multilingual_parents');

  const housingSituation = answers['housing_situation'] ?? [];
  if (housingSituation.includes('Homeowner')) {
    suggested.add('homeowner_parents');
    const homeDetail = answers['housing_homeowner_detail']?.[0];
    if (homeDetail === 'Suburban single-family home')                       suggested.add('suburban_parents');
    if (homeDetail === 'Urban / City home')                                 suggested.add('urban_parents');
    if (homeDetail === 'Condo / Townhouse / Row home')                      suggested.add('condo_townhouse_parents');
    if (homeDetail === 'Rural property')                                    suggested.add('rural_parents');
    if (homeDetail === 'Farm')                                              suggested.add('farm_parents');
    if (homeDetail === 'New construction / Just built' ||
        homeDetail === 'First-time homeowner — still figuring it out!')     suggested.add('new_construction_parents');
  }
  if (housingSituation.includes('Renting / Leasing')) {
    suggested.add('renting_parents');
    const rentDetail = answers['housing_renting_detail']?.[0];
    if (rentDetail === 'Urban apartment')                                   { suggested.add('apartment_parents'); suggested.add('urban_parents'); }
    if (rentDetail === 'Suburban apartment or complex')                     suggested.add('apartment_parents');
    if (rentDetail === 'House or townhouse rental')                         suggested.add('house_rental_parents');
    if (rentDetail === 'Condo rental')                                      suggested.add('condo_townhouse_parents');
    if (rentDetail === 'Saving up to buy')                                  suggested.add('saving_to_buy_parents');
  }
  if (housingSituation.includes('Multigenerational household (living with family)')) {
    suggested.add('multigenerational_parents');
    const multiGenDetail = answers['housing_multigenerational_detail'] ?? [];
    if (multiGenDetail.includes('My parents / my side of the family'))      suggested.add('living_with_own_family_parents');
    if (multiGenDetail.includes("Partner's parents / in-laws"))             suggested.add('inlaws_parents');
    if (multiGenDetail.includes('Multiple generations (grandparents, parents, and children)')) suggested.add('three_gen_household_parents');
    if (multiGenDetail.includes('Parents or in-laws in a separate attached unit or ADU')) suggested.add('adu_parents');
  }
  if (housingSituation.includes('Tiny home / Van life / Alternative housing')) {
    suggested.add('tiny_home_parents');
    const altDetail = answers['housing_alternative_detail']?.[0];
    if (altDetail === 'Van life')                                           suggested.add('van_life_parents');
    if (altDetail === 'Full-time RV / travel trailer')                      suggested.add('rv_parents');
    if (altDetail === 'Skoolie (converted school bus)')                     suggested.add('skoolie_parents');
    if (altDetail === 'Off-grid / Earthship / Yurt')                        suggested.add('off_grid_parents');
  }
  if (housingSituation.includes('Rural property / Farm')) {
    suggested.add('rural_parents');
    suggested.add('farm_parents');
  }

  const transportation = answers['transportation'] ?? [];
  if (transportation.includes('I use public transportation')) {
    suggested.add('public_transit_parents');
    const pubDetail = answers['transportation_public_detail'] ?? [];
    if (pubDetail.includes('City bus / local bus routes') ||
        pubDetail.includes('Metro / subway / light rail'))                  suggested.add('city_bus_metro_parents');
    if (pubDetail.includes('Commuter rail / regional train'))              suggested.add('commuter_rail_parents');
    if (pubDetail.includes('Paratransit / accessible transit service'))    suggested.add('paratransit_parents');
    if (pubDetail.includes('Limited routes — not many options where I live') ||
        pubDetail.includes('Multiple transfers needed to get anywhere with kids')) suggested.add('limited_transit_parents');
  }
  if (transportation.includes('Limited or unreliable vehicle')) {
    suggested.add('unreliable_transportation_parents');
    const unreliableDetail = answers['transportation_unreliable_detail'] ?? [];
    if (unreliableDetail.includes('One car shared between household members')) suggested.add('one_car_household_parents');
    if (unreliableDetail.includes('Car frequently needs repairs') ||
        unreliableDetail.includes('Recently lost access to a vehicle'))    suggested.add('car_repairs_parents');
  }
  if (transportation.includes('No car — I rely on rides from others'))     suggested.add('rides_from_others_parents');
  if (transportation.includes('No car — I live in a walkable / bikeable area')) {
    suggested.add('no_car_parents');
    suggested.add('walkable_city_parents');
  }
  if (transportation.includes('No car — rural area with limited transit options')) {
    suggested.add('no_car_parents');
    suggested.add('rural_no_transit_parents');
    suggested.add('rural_parents');
  }

  const dietaryRestrictions = answers['dietary_restrictions'] ?? [];
  if (dietaryRestrictions.includes('Food allergies')) {
    suggested.add('food_allergies');
    const allergyDetail = answers['dietary_allergies_detail'] ?? [];
    if (allergyDetail.includes('Peanut allergy'))                                         suggested.add('peanut_allergy_parents');
    if (allergyDetail.includes('Tree nut allergy'))                                        suggested.add('tree_nut_allergy_parents');
    if (allergyDetail.includes('Milk / dairy allergy'))                                    suggested.add('dairy_allergy_parents');
    if (allergyDetail.includes('Egg allergy'))                                             suggested.add('egg_allergy_parents');
    if (allergyDetail.includes('Wheat / gluten allergy'))                                  suggested.add('gluten_celiac_parents');
    if (allergyDetail.includes('Multiple food allergies'))                                 suggested.add('multiple_allergy_parents');
    if (allergyDetail.includes('Anaphylactic / severe allergy (epi-pen required)'))        suggested.add('anaphylaxis_parents');
    if (allergyDetail.includes('Eosinophilic Esophagitis (EoE)'))                          suggested.add('eoe_parents');
    if (allergyDetail.includes('FPIES (Food Protein-Induced Enterocolitis Syndrome)'))     suggested.add('fpies_parents');
  }
  if (dietaryRestrictions.includes('Special diet (vegan, vegetarian, kosher, halal, etc.)') ||
      dietaryRestrictions.includes('Medical diet (celiac, diabetic, elimination diet, etc.)')) {
    const specialDetail = answers['dietary_special_detail'] ?? [];
    if (specialDetail.includes('Gluten-free (celiac or non-celiac sensitivity)'))          suggested.add('gluten_free_family');
    if (specialDetail.includes('Vegan'))                                                   suggested.add('vegan_family');
    if (specialDetail.includes('Vegetarian'))                                              suggested.add('vegetarian_family');
    if (specialDetail.includes('Kosher'))                                                  suggested.add('kosher_family');
    if (specialDetail.includes('Halal'))                                                   suggested.add('halal_family');
    if (specialDetail.includes('Elimination diet') ||
        specialDetail.includes('GAPS or SCD diet') ||
        specialDetail.includes('AIP (Autoimmune Protocol)'))                               suggested.add('elimination_diet_parents');
  }

  const mentalHealth = answers['mental_health'] ?? [];
  if (mentalHealth.includes('Postpartum depression (PPD)')) {
    suggested.add('ppd_parents');
    suggested.add('pmad_parents');
    suggested.add('postpartum');
  }
  if (mentalHealth.includes('Postpartum anxiety (PPA)')) {
    suggested.add('ppa_parents');
    suggested.add('pmad_parents');
    suggested.add('postpartum');
  }
  if (mentalHealth.includes('Postpartum OCD'))                                suggested.add('postpartum_ocd_parents');
  if (mentalHealth.includes('Postpartum rage'))                               suggested.add('postpartum_rage_parents');
  if (mentalHealth.includes('Postpartum psychosis (survivor)'))               suggested.add('postpartum_psychosis_survivors');
  if (mentalHealth.includes('Postpartum OCD') ||
      mentalHealth.includes('Postpartum rage') ||
      mentalHealth.includes('Postpartum psychosis (survivor)'))              { suggested.add('pmad_parents'); suggested.add('postpartum'); }
  if (mentalHealth.includes('Prenatal / antepartum depression or anxiety'))   suggested.add('prenatal_depression_parents');
  if (mentalHealth.includes('Birth trauma or PTSD')) {
    suggested.add('birth_trauma_parents');
    suggested.add('birth_ptsd_parents');
  }
  if (mentalHealth.includes('Caregiver burnout'))                             suggested.add('caregiver_burnout');
  if (mentalHealth.includes('Grief from pregnancy or infant loss'))           suggested.add('bereaved_parents');
  if (mentalHealth.includes('General parental anxiety or depression'))        suggested.add('parent_mental_health_parents');
  if (mentalHealth.includes('Chronic or pre-existing mental health condition')) suggested.add('chronic_mental_health_parents');
  if (mentalHealth.includes('Seeking support / not sure what I\'m experiencing')) suggested.add('parent_mental_health_parents');
  const ppaPpdDetail = answers['mental_health_ppd_ppa_detail'] ?? [];
  if (ppaPpdDetail.includes('Paternal / non-birthing partner experiencing PPD or PPA')) suggested.add('paternal_ppd_parents');
  if (ppaPpdDetail.includes('Struggling to get a diagnosis or find support')) {
    suggested.add('ppd_isolation_parents');
    suggested.add('parent_mental_health_parents');
  }

  if (housingSituation.includes('Experiencing housing instability')) {
    suggested.add('housing_instability_parents');
    const instabilityDetail = answers['housing_instability_detail'] ?? [];
    if (instabilityDetail.includes('At risk of eviction'))                  suggested.add('eviction_risk_parents');
    if (instabilityDetail.includes('Facing foreclosure'))                   suggested.add('foreclosure_parents');
    if (instabilityDetail.includes('Staying with others temporarily'))      suggested.add('couch_surfing_parents');
    if (instabilityDetail.includes('In a shelter or transitional housing')) suggested.add('shelter_parents');
    if (instabilityDetail.includes('Navigating housing assistance programs')) suggested.add('housing_assistance_parents');
  }

  return Array.from(suggested);
}

function getNextVisibleStep(from: number, answers: Record<string, string[]>): number | null {
  for (let i = from + 1; i < QUIZ_QUESTIONS.length; i++) {
    if (!QUIZ_QUESTIONS[i].skipIf?.(answers)) return i;
  }
  return null;
}

function getPrevVisibleStep(from: number, answers: Record<string, string[]>): number {
  for (let i = from - 1; i >= 0; i--) {
    if (!QUIZ_QUESTIONS[i].skipIf?.(answers)) return i;
  }
  return 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VillageTab() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const lp = useMemo(() => makeLocationPickerStyles(c), [c]);

  const [joinedIds, setJoinedIds]       = useState<Set<string>>(new Set());
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [loading, setLoading]           = useState(true);
  const [joining, setJoining]           = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [quizDone, setQuizDone]         = useState(false);
  const [showQuiz, setShowQuiz]         = useState(false);
  const [quizStep, setQuizStep]         = useState(0);
  const [quizAnswers, setQuizAnswers]   = useState<Record<string, string[]>>({});
  const [quizComplete, setQuizComplete]   = useState(false);
  const [suggestions, setSuggestions]     = useState<string[]>([]);
  const [locCountry, setLocCountry]       = useState('');
  const [locState, setLocState]           = useState('');
  const [locCity, setLocCity]             = useState('');
  const [locSearch, setLocSearch]         = useState('');

  const [showRequestModal, setShowRequestModal]   = useState(false);
  const [requestText, setRequestText]             = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestDone, setRequestDone]             = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: { user } }, done] = await Promise.all([
        supabase.auth.getUser(),
        AsyncStorage.getItem('village_quiz_done'),
      ]);
      if (!user) return;
      setQuizDone(done === 'true');
      const { data } = await supabase
        .from('user_villages')
        .select('village_id')
        .eq('user_id', user.id);
      if (data) setJoinedIds(new Set(data.map((r: any) => r.village_id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  function closeQuiz() {
    setShowQuiz(false);
    setQuizStep(0);
    setQuizAnswers({});
    setQuizComplete(false);
    setLocCountry(''); setLocState(''); setLocCity(''); setLocSearch('');
  }

  async function retakeQuiz() {
    await AsyncStorage.removeItem('village_quiz_done');
    setQuizDone(false);
    setQuizStep(0);
    setQuizAnswers({});
    setQuizComplete(false);
    setLocCountry(''); setLocState(''); setLocCity(''); setLocSearch('');
    setShowQuiz(true);
  }

  async function toggleJoin(villageId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setJoining(villageId);
    if (joinedIds.has(villageId)) {
      await supabase.from('user_villages').delete().eq('user_id', user.id).eq('village_id', villageId);
      setJoinedIds(prev => { const next = new Set(prev); next.delete(villageId); return next; });
    } else {
      await supabase.from('user_villages').insert({ user_id: user.id, village_id: villageId });
      setJoinedIds(prev => new Set([...prev, villageId]));
    }
    setJoining(null);
  }

  function toggleAnswer(questionId: string, option: string, multi: boolean) {
    setQuizAnswers(prev => {
      const current = prev[questionId] ?? [];
      if (multi) {
        return {
          ...prev,
          [questionId]: current.includes(option)
            ? current.filter(o => o !== option)
            : [...current, option],
        };
      }
      return { ...prev, [questionId]: [option] };
    });
  }

  async function finishQuiz(extraAnswers?: Record<string, string[]>) {
    const all = { ...quizAnswers, ...(extraAnswers ?? {}) };
    const suggested = suggestVillages(all);
    setSuggestions(suggested);
    setQuizComplete(true);
    await AsyncStorage.setItem('village_quiz_done', 'true');
    setQuizDone(true);
  }

  async function submitVillageRequest() {
    const trimmed = requestText.trim();
    if (!trimmed) return;
    setSubmittingRequest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error } = await supabase
        .from('village_requests')
        .insert({ user_id: user.id, description: trimmed });
      if (error) throw error;
      setRequestDone(true);
      setRequestText('');
    } catch (e: any) {
      Alert.alert('Could not submit', e.message ?? 'Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function joinAllSuggested() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const toJoin = suggestions.filter(id => !joinedIds.has(id));
    if (toJoin.length > 0) {
      await supabase.from('user_villages').insert(
        toJoin.map(village_id => ({ user_id: user.id, village_id }))
      );
      setJoinedIds(prev => new Set([...prev, ...toJoin]));
    }
    closeQuiz();
  }

  const filtered = search.trim()
    ? VILLAGES.filter(v =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.description.toLowerCase().includes(search.toLowerCase())
      )
    : VILLAGES;

  const myVillages  = VILLAGES.filter(v => joinedIds.has(v.id));
  const discoverList = filtered.filter(v => !joinedIds.has(v.id) && !v.hidden);

  const currentQ        = QUIZ_QUESTIONS[quizStep];
  const isLocationStep  = currentQ?.type === 'location';
  const currentAnswers  = quizAnswers[currentQ?.id] ?? [];
  const canAdvance      = isLocationStep ? locCountry !== '' : currentAnswers.length > 0;
  const nextVisibleStep = getNextVisibleStep(quizStep, quizAnswers);
  const isLastStep      = nextVisibleStep === null;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.heading}>Village</Text>

        {/* Search bar */}
        <View style={s.searchRow}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search villages..."
            placeholderTextColor={c.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Request a village banner */}
        <TouchableOpacity
          style={s.requestBanner}
          onPress={() => { setRequestDone(false); setShowRequestModal(true); }}
          activeOpacity={0.82}
        >
          <Text style={s.requestBannerEmoji}>💌</Text>
          <Text style={s.requestBannerText}>Don't see your village? Request one</Text>
          <Text style={s.requestBannerArrow}>›</Text>
        </TouchableOpacity>

        {/* Request modal */}
        <Modal visible={showRequestModal} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={s.modalSafe}>
            <View style={s.modalHeader}>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowRequestModal(false)}>
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>Request a Village</Text>
              <View style={s.modalCloseBtn} />
            </View>

            <ScrollView contentContainerStyle={s.quizContent} keyboardShouldPersistTaps="handled">
              {requestDone ? (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Text style={{ fontSize: 48, marginBottom: 16 }}>🎉</Text>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 8, textAlign: 'center' }}>
                    Request sent!
                  </Text>
                  <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 22 }}>
                    Thanks for the suggestion. We'll review it and may add it as a new village soon.
                  </Text>
                  <TouchableOpacity
                    style={[s.joinBtn, { marginTop: 32, paddingHorizontal: 28, paddingVertical: 12 }]}
                    onPress={() => setShowRequestModal(false)}
                  >
                    <Text style={s.joinBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={[s.questionText, { marginBottom: 6 }]}>What village is missing?</Text>
                  <Text style={s.questionSub}>
                    Describe the community you'd love to see — e.g. "Moms of toddlers in Austin, TX" or "Bilingual parenting".
                  </Text>
                  <TextInput
                    style={s.requestInput}
                    placeholder="Describe your village idea..."
                    placeholderTextColor={c.textMuted}
                    value={requestText}
                    onChangeText={setRequestText}
                    multiline
                    maxLength={300}
                    textAlignVertical="top"
                  />
                  <Text style={s.requestCharCount}>{requestText.length}/300</Text>
                  <TouchableOpacity
                    style={[s.joinBtn, { paddingVertical: 14, borderRadius: 14, opacity: requestText.trim() ? 1 : 0.45 }]}
                    onPress={submitVillageRequest}
                    disabled={submittingRequest || !requestText.trim()}
                    activeOpacity={0.8}
                  >
                    {submittingRequest
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.joinBtnText}>Send Request</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Find Your Villages quiz card */}
        {!quizDone && !search && (
          <TouchableOpacity style={s.quizCard} onPress={() => setShowQuiz(true)} activeOpacity={0.85}>
            <Text style={s.quizCardEmoji}>🏘️</Text>
            <View style={s.quizCardBody}>
              <Text style={s.quizCardTitle}>Find Your Villages</Text>
              <Text style={s.quizCardSub}>Answer a few questions to discover your perfect communities</Text>
            </View>
            <Text style={s.quizCardArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Retake quiz button */}
        {quizDone && !search && (
          <TouchableOpacity style={s.retakeRow} onPress={retakeQuiz} activeOpacity={0.75}>
            <Text style={s.retakeIcon}>🔄</Text>
            <View style={s.retakeBody}>
              <Text style={s.retakeTitle}>Retake village quiz</Text>
              <Text style={s.retakeSub}>Update your villages — new baby on the way?</Text>
            </View>
            <Text style={s.retakeArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* My Villages */}
        {myVillages.length > 0 && !search && (
          <>
            <Text style={s.sectionTitle}>My Villages</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.joinedScroll}
              contentContainerStyle={{ paddingRight: 8 }}
            >
              {myVillages.map((v, i) => {
                const chipColors = [
                  { bg: c.cardLavender, border: c.lavender },
                  { bg: c.cardBlue,     border: c.blue },
                  { bg: c.cardBlush,    border: c.blush },
                  { bg: c.cardHoney,    border: c.honey },
                  { bg: c.cardSage,     border: c.sage },
                ];
                const cc = chipColors[i % chipColors.length];
                return (
                  <View key={v.id} style={[s.joinedChip, { backgroundColor: cc.bg, borderColor: cc.border }]}>
                    <TouchableOpacity
                      style={s.joinedChipBody}
                      onPress={() => setSelectedVillage(v)}
                      activeOpacity={0.75}
                    >
                      <Text style={s.joinedChipEmoji}>{v.emoji}</Text>
                      <Text style={s.joinedChipName} numberOfLines={1}>{v.name}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => toggleJoin(v.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.joinedChipLeave}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Discover / Search results */}
        {discoverList.length > 0 && (
          <>
            <Text style={s.sectionTitle}>{search ? 'Results' : 'Discover'}</Text>
            {discoverList.map(v => (
              <VillageCard
                key={v.id}
                village={v}
                joining={joining === v.id}
                onJoin={() => toggleJoin(v.id)}
                onOpen={() => setSelectedVillage(v)}
              />
            ))}
          </>
        )}

        {search && filtered.length === 0 && (
          <View style={s.emptySearch}>
            <Text style={s.emptySearchEmoji}>🔍</Text>
            <Text style={s.emptySearchText}>No villages found for "{search}"</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Village feed sheet ── */}
      <VillageFeedSheet
        village={selectedVillage}
        visible={selectedVillage !== null}
        onClose={() => setSelectedVillage(null)}
        joined={selectedVillage !== null && joinedIds.has(selectedVillage.id)}
        onToggleJoin={() => selectedVillage && toggleJoin(selectedVillage.id)}
      />

      {/* ── Quiz modal ── */}
      <Modal
        visible={showQuiz}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeQuiz}
      >
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={closeQuiz} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>✕</Text>
            </TouchableOpacity>
            {!quizComplete && (
              <Text style={s.modalStep}>{quizStep + 1} of {QUIZ_QUESTIONS.length}</Text>
            )}
            <View style={{ width: 40 }} />
          </View>

          {quizComplete ? (
            /* ── Results ── */
            <ScrollView contentContainerStyle={s.resultsContent}>
              <Text style={s.resultsEmoji}>🎉</Text>
              <Text style={s.resultsTitle}>Your villages are ready!</Text>
              <Text style={s.resultsSub}>
                {suggestions.length > 0
                  ? 'Based on your answers, we think you\'d love these:'
                  : 'Explore all our villages below and join the ones that feel right.'}
              </Text>

              {VILLAGES.filter(v => suggestions.includes(v.id)).map(v => (
                <VillageCard
                  key={v.id}
                  village={v}
                  joining={joining === v.id}
                  joined={joinedIds.has(v.id)}
                  onJoin={() => toggleJoin(v.id)}
                  onOpen={() => setSelectedVillage(v)}
                  fullWidth
                />
              ))}

              {suggestions.length > 0 && (
                <TouchableOpacity style={s.joinAllBtn} onPress={joinAllSuggested}>
                  <Text style={s.joinAllBtnText}>Join All & Continue</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.skipBtn} onPress={closeQuiz}>
                <Text style={s.skipBtnText}>{suggestions.length > 0 ? 'Skip for now' : 'Done'}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* ── Question ── */
            <ScrollView contentContainerStyle={s.quizContent} keyboardShouldPersistTaps="handled">
              {/* Progress bar */}
              <View style={s.progressBar}>
                <View style={{ flex: quizStep + 1, backgroundColor: c.progressFill, borderRadius: 3 }} />
                <View style={{ flex: QUIZ_QUESTIONS.length - quizStep - 1 }} />
              </View>

              <Text style={s.questionText}>{currentQ.question}</Text>
              {currentQ.multi && !isLocationStep && (
                <Text style={s.questionSub}>Select all that apply</Text>
              )}

              {isLocationStep ? (
                <LocationPicker
                  country={locCountry} state={locState} city={locCity} search={locSearch}
                  onCountryChange={c => { setLocCountry(c); setLocState(''); setLocCity(''); setLocSearch(''); }}
                  onStateChange={s => { setLocState(s); setLocCity(''); setLocSearch(''); }}
                  onCityChange={setLocCity}
                  onSearchChange={setLocSearch}
                />
              ) : (
                <>
                  {currentQ.options.map(option => {
                    const selected = currentAnswers.includes(option);
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[s.optionBtn, selected && s.optionBtnSelected]}
                        onPress={() => toggleAnswer(currentQ.id, option, currentQ.multi)}
                        activeOpacity={0.75}
                      >
                        <View style={[s.optionDot, selected && s.optionDotSelected]} />
                        <Text style={[s.optionText, selected && s.optionTextSelected]}>{option}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {currentQ.hasRequestButton && (
                    <TouchableOpacity
                      style={lp.requestBtn}
                      activeOpacity={0.75}
                      onPress={() => Alert.alert('Coming soon', 'Village request submissions will be available soon!')}
                    >
                      <Text style={lp.requestBtnText}>✋ Don't see yours? Request to add a village</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <View style={s.quizNavRow}>
                {quizStep > 0 && (
                  <TouchableOpacity style={s.backBtn} onPress={() => setQuizStep(q => getPrevVisibleStep(q, quizAnswers))}>
                    <Text style={s.backBtnText}>← Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
                  onPress={() => {
                    if (isLocationStep) {
                      const loc: Record<string, string[]> = {};
                      if (locCountry) loc['location_country'] = [locCountry];
                      if (locState)   loc['location_state']   = [locState];
                      if (locCity)    loc['location_city']    = [locCity];
                      const next = getNextVisibleStep(quizStep, quizAnswers);
                      if (next === null) { finishQuiz(loc); return; }
                      setQuizAnswers(prev => ({ ...prev, ...loc }));
                      setQuizStep(next);
                    } else {
                      const next = getNextVisibleStep(quizStep, quizAnswers);
                      next === null ? finishQuiz() : setQuizStep(next);
                    }
                  }}
                  disabled={!canAdvance}
                >
                  <Text style={s.nextBtnText}>
                    {isLastStep ? 'See My Villages →' : 'Next →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Location picker sub-component ───────────────────────────────────────────

function LocationPicker({
  country, state, city, search,
  onCountryChange, onStateChange, onCityChange, onSearchChange,
}: {
  country: string; state: string; city: string; search: string;
  onCountryChange: (c: string) => void;
  onStateChange:   (s: string) => void;
  onCityChange:    (c: string) => void;
  onSearchChange:  (t: string) => void;
}) {
  const c = useColors();
  const lp = useMemo(() => makeLocationPickerStyles(c), [c]);
  const stateList  = country ? (STATES_BY_COUNTRY[country] ?? []) : [];
  const cityList   = state   ? (CITIES_BY_STATE[state]    ?? []) : [];
  const hasStates  = stateList.length > 0;
  const hasCities  = cityList.length  > 0;

  const filteredStates = search
    ? stateList.filter(s => s.toLowerCase().includes(search.toLowerCase()))
    : stateList;
  const filteredCities = search
    ? cityList.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : cityList;

  return (
    <View>
      {/* Country */}
      <Text style={lp.label}>Country</Text>
      <View style={lp.grid}>
        {COUNTRIES.map(c => (
          <TouchableOpacity
            key={c}
            style={[lp.chip, country === c && lp.chipSelected]}
            onPress={() => onCountryChange(c)}
            activeOpacity={0.75}
          >
            <Text style={[lp.chipText, country === c && lp.chipTextSelected]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* State / Province */}
      {hasStates && (
        <>
          <Text style={lp.label}>{country === 'Canada' ? 'Province' : 'State'}</Text>
          <TextInput
            style={lp.searchInput}
            placeholder={`Search ${country === 'Canada' ? 'provinces' : 'states'}...`}
            placeholderTextColor={c.textMuted}
            value={state ? '' : search}
            onChangeText={t => { onStateChange(''); onSearchChange(t); }}
            onFocus={() => { if (state) { onStateChange(''); } }}
          />
          <View style={lp.grid}>
            {filteredStates.map(st => (
              <TouchableOpacity
                key={st}
                style={[lp.chip, state === st && lp.chipSelected]}
                onPress={() => { onStateChange(st); onSearchChange(''); }}
                activeOpacity={0.75}
              >
                <Text style={[lp.chipText, state === st && lp.chipTextSelected]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* City */}
      {hasCities && (
        <>
          <Text style={lp.label}>City</Text>
          <TextInput
            style={lp.searchInput}
            placeholder="Search cities..."
            placeholderTextColor={c.textMuted}
            value={city ? '' : search}
            onChangeText={t => { onCityChange(''); onSearchChange(t); }}
            onFocus={() => { if (city) { onCityChange(''); } }}
          />
          <View style={lp.grid}>
            {filteredCities.map(ct => (
              <TouchableOpacity
                key={ct}
                style={[lp.chip, city === ct && lp.chipSelected]}
                onPress={() => { onCityChange(ct); onSearchChange(''); }}
                activeOpacity={0.75}
              >
                <Text style={[lp.chipText, city === ct && lp.chipTextSelected]}>{ct}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {state && (
            <TouchableOpacity style={lp.requestBtn} activeOpacity={0.75}>
              <Text style={lp.requestBtnText}>🏙️ My city isn't listed — request to add it</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

function makeLocationPickerStyles(c: Colors) {
  return StyleSheet.create({
    label:      { fontSize: 13, fontWeight: '700', color: c.textMuted, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    searchInput: {
      backgroundColor: c.card, borderRadius: 10, borderWidth: 1.5, borderColor: c.separator,
      paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: c.textPrimary, marginBottom: 8,
    },
    grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.bgAlt, borderWidth: 1.5, borderColor: c.cardBorder },
    chipSelected: { backgroundColor: c.optionSelected, borderColor: c.optionSelectedBorder },
    chipText:   { fontSize: 13, color: c.textSecondary, fontWeight: '500' },
    chipTextSelected: { color: c.textPrimary, fontWeight: '700' },
    requestBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: c.separator, borderStyle: 'dashed' },
    requestBtnText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  });
}

// ─── Village card sub-component ───────────────────────────────────────────────

function VillageCard({
  village, joining, joined = false, onJoin, onOpen, fullWidth = false,
}: {
  village: Village;
  joining: boolean;
  joined?: boolean;
  onJoin: () => void;
  onOpen?: () => void;
  fullWidth?: boolean;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <TouchableOpacity
      style={[s.villageCard, fullWidth && { width: '100%' }]}
      onPress={onOpen}
      activeOpacity={onOpen ? 0.78 : 1}
    >
      <Text style={s.villageEmoji}>{village.emoji}</Text>
      <View style={s.villageInfo}>
        <Text style={s.villageName}>{village.name}</Text>
        <Text style={s.villageDesc}>{village.description}</Text>
      </View>
      <TouchableOpacity
        style={[s.joinBtn, joined && s.joinBtnJoined]}
        onPress={onJoin}
        disabled={joining}
      >
        {joining
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={[s.joinBtnText, joined && s.joinBtnTextJoined]}>
              {joined ? '✓ Joined' : '+ Join'}
            </Text>
        }
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 24, paddingBottom: 40 },

    heading: {
      fontSize: 26,
      fontWeight: '800',
      color: c.textSecondary,
      marginBottom: 16,
    },

    // ── Search
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: c.separator,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
      gap: 8,
    },
    searchIcon: { fontSize: 16 },
    searchInput: { flex: 1, fontSize: 15, color: c.textSecondary, padding: 0 },
    searchClear: { fontSize: 14, color: c.textMuted, paddingHorizontal: 4 },

    // ── Quiz card
    quizCard: {
      backgroundColor: c.quizCard,
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 28,
      borderLeftWidth: 5,
      borderLeftColor: c.quizCardBorder,
      gap: 14,
      shadowColor: c.quizCardBorder,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 3,
    },
    quizCardEmoji: { fontSize: 32 },
    quizCardBody: { flex: 1 },
    quizCardTitle: { fontSize: 17, fontWeight: '800', color: c.textSecondary, marginBottom: 4 },
    quizCardSub: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
    quizCardArrow: { fontSize: 22, color: c.quizCardBorder, fontWeight: '600' },

    // ── Request banner
    requestBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.cardBlush,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: c.blush,
      gap: 10,
    },
    requestBannerEmoji: { fontSize: 20 },
    requestBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textSecondary },
    requestBannerArrow: { fontSize: 20, color: c.textMuted, fontWeight: '600' },
    requestInput: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.separator,
      padding: 14,
      fontSize: 15,
      color: c.textPrimary,
      minHeight: 120,
      marginBottom: 8,
    },
    requestCharCount: { fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 24 },

    // ── Retake quiz row
    retakeRow: {
      backgroundColor: c.retakeCard,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 28,
      borderLeftWidth: 5,
      borderLeftColor: c.retakeCardBorder,
      gap: 14,
    },
    retakeIcon:  { fontSize: 26 },
    retakeBody:  { flex: 1 },
    retakeTitle: { fontSize: 15, fontWeight: '700', color: c.textSecondary, marginBottom: 2 },
    retakeSub:   { fontSize: 12, color: c.textMuted },
    retakeArrow: { fontSize: 22, color: c.retakeCardBorder, fontWeight: '600' },

    // ── Section title
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 12,
    },

    // ── My Villages
    joinedScroll: { marginBottom: 28 },
    joinedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.joinedBg,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginRight: 10,
      gap: 6,
      borderWidth: 1,
      borderColor: c.joinedBorder,
      maxWidth: 180,
    },
    joinedChipBody: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    joinedChipEmoji: { fontSize: 18 },
    joinedChipName: { fontSize: 13, fontWeight: '700', color: c.textPrimary, flex: 1 },
    joinedChipLeave: { fontSize: 11, color: c.textMuted, paddingLeft: 4 },

    // ── Village card
    villageCard: {
      backgroundColor: c.cardLavender,
      borderRadius: 14,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      borderWidth: 2,
      borderColor: c.lavender,
      gap: 12,
    },
    villageEmoji: { fontSize: 28 },
    villageInfo: { flex: 1 },
    villageName: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    villageDesc: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    joinBtn: {
      backgroundColor: c.joinBtn,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 7,
      minWidth: 68,
      alignItems: 'center',
    },
    joinBtnJoined: { backgroundColor: c.joinedBg },
    joinBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    joinBtnTextJoined: { color: c.joinedBorder },

    // ── Empty search
    emptySearch: { padding: 40, alignItems: 'center' },
    emptySearchEmoji: { fontSize: 36, marginBottom: 12 },
    emptySearchText: { fontSize: 14, color: c.textMuted, textAlign: 'center' },

    // ── Quiz modal
    modalSafe: { flex: 1, backgroundColor: c.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.separator,
    },
    modalCloseBtn: { width: 40, alignItems: 'flex-start' },
    modalCloseText: { fontSize: 18, color: c.textMuted },
    modalStep: { fontSize: 14, fontWeight: '600', color: c.textMuted },

    // ── Quiz question
    quizContent: { padding: 24, paddingBottom: 40 },
    progressBar: {
      flexDirection: 'row',
      height: 6,
      backgroundColor: c.separator,
      borderRadius: 3,
      marginBottom: 32,
      overflow: 'hidden',
    },
    questionText: {
      fontSize: 20,
      fontWeight: '800',
      color: c.textPrimary,
      lineHeight: 28,
      marginBottom: 8,
    },
    questionSub: { fontSize: 13, color: c.textMuted, marginBottom: 20 },
    optionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1.5,
      borderColor: c.separator,
      gap: 12,
    },
    optionBtnSelected: { backgroundColor: c.optionSelected, borderColor: c.optionSelectedBorder },
    optionDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.primaryDisabled,
      backgroundColor: c.card,
    },
    optionDotSelected: { backgroundColor: c.optionDotSelected, borderColor: c.optionDotSelected },
    optionText: { flex: 1, fontSize: 15, color: c.textSecondary, fontWeight: '500' },
    optionTextSelected: { fontWeight: '700', color: c.textPrimary },
    quizNavRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
    },
    backBtn: { paddingHorizontal: 8, paddingVertical: 12 },
    backBtnText: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    nextBtn: {
      backgroundColor: c.nextBtn,
      borderRadius: 14,
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    nextBtnDisabled: { backgroundColor: c.primaryDisabled },
    nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // ── Quiz results
    resultsContent: { padding: 24, paddingBottom: 40, alignItems: 'center' },
    resultsEmoji: { fontSize: 52, marginTop: 16, marginBottom: 16 },
    resultsTitle: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 8, textAlign: 'center' },
    resultsSub: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 8 },
    joinAllBtn: {
      backgroundColor: c.fab,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 28,
      alignItems: 'center',
      width: '100%',
      marginTop: 8,
      marginBottom: 10,
    },
    joinAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    skipBtn: { paddingVertical: 12 },
    skipBtnText: { fontSize: 14, color: c.textMuted, fontWeight: '600' },
  });
}
