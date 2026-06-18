import { QUIZ_QUESTIONS } from './quizData';
import { CHILD_AGES, toVillageId } from './villageData';

export function suggestVillages(answers: Record<string, string[]>): string[] {
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

export function getNextVisibleStep(from: number, answers: Record<string, string[]>): number | null {
  for (let i = from + 1; i < QUIZ_QUESTIONS.length; i++) {
    if (!QUIZ_QUESTIONS[i].skipIf?.(answers)) return i;
  }
  return null;
}

export function getPrevVisibleStep(from: number, answers: Record<string, string[]>): number {
  for (let i = from - 1; i >= 0; i--) {
    if (!QUIZ_QUESTIONS[i].skipIf?.(answers)) return i;
  }
  return 0;
}
