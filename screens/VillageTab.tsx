import React, { useCallback, useState } from 'react';
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

// ─── Village list ─────────────────────────────────────────────────────────────
// TODO: Replace / extend this list once the final villages are confirmed

interface Village {
  id: string;
  name: string;
  emoji: string;
  description: string;
  hidden?: boolean; // hidden from Discover list; accessible via quiz or search only
}

// ─── Location data ────────────────────────────────────────────────────────────

function toVillageId(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const COUNTRIES = [
  'United States', 'Canada', 'United Kingdom', 'Australia', 'New Zealand',
  'Ireland', 'India', 'Philippines', 'South Africa', 'Nigeria', 'Ghana',
  'Kenya', 'Germany', 'France', 'Mexico', 'Brazil', 'Jamaica',
  'Trinidad and Tobago', 'Singapore', 'Other',
];

const STATES_BY_COUNTRY: Record<string, string[]> = {
  'United States': [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
    'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
    'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming','Washington D.C.',
  ],
  'Canada': [
    'Alberta','British Columbia','Manitoba','New Brunswick',
    'Newfoundland and Labrador','Nova Scotia','Ontario','Prince Edward Island',
    'Quebec','Saskatchewan','Northwest Territories','Nunavut','Yukon',
  ],
};

const CITIES_BY_STATE: Record<string, string[]> = {
  'Alabama': ['Birmingham','Montgomery','Huntsville','Mobile'],
  'Alaska': ['Anchorage','Fairbanks','Juneau'],
  'Arizona': ['Phoenix','Tucson','Mesa','Scottsdale','Chandler'],
  'Arkansas': ['Little Rock','Fort Smith','Fayetteville'],
  'California': ['Los Angeles','San Francisco','San Diego','San Jose','Sacramento','Oakland','Fresno','Long Beach','Anaheim'],
  'Colorado': ['Denver','Colorado Springs','Aurora','Boulder','Fort Collins'],
  'Connecticut': ['Bridgeport','New Haven','Hartford','Stamford'],
  'Delaware': ['Wilmington','Dover','Newark'],
  'Florida': ['Miami','Orlando','Tampa','Jacksonville','Fort Lauderdale','St. Petersburg','Tallahassee'],
  'Georgia': ['Atlanta','Augusta','Columbus','Savannah','Athens'],
  'Hawaii': ['Honolulu','Pearl City','Hilo','Kailua'],
  'Idaho': ['Boise','Nampa','Meridian','Idaho Falls'],
  'Illinois': ['Chicago','Aurora','Naperville','Rockford','Joliet'],
  'Indiana': ['Indianapolis','Fort Wayne','Evansville','South Bend'],
  'Iowa': ['Des Moines','Cedar Rapids','Davenport','Sioux City'],
  'Kansas': ['Wichita','Overland Park','Kansas City','Topeka'],
  'Kentucky': ['Louisville','Lexington','Bowling Green'],
  'Louisiana': ['New Orleans','Baton Rouge','Shreveport','Lafayette'],
  'Maine': ['Portland','Lewiston','Bangor'],
  'Maryland': ['Baltimore','Frederick','Gaithersburg','Silver Spring'],
  'Massachusetts': ['Boston','Worcester','Springfield','Cambridge','Lowell'],
  'Michigan': ['Detroit','Grand Rapids','Warren','Sterling Heights','Ann Arbor'],
  'Minnesota': ['Minneapolis','St. Paul','Rochester','Bloomington','Duluth'],
  'Mississippi': ['Jackson','Gulfport','Southaven'],
  'Missouri': ['Kansas City','St. Louis','Springfield','Columbia'],
  'Montana': ['Billings','Missoula','Great Falls','Bozeman'],
  'Nebraska': ['Omaha','Lincoln','Bellevue'],
  'Nevada': ['Las Vegas','Henderson','Reno','North Las Vegas'],
  'New Hampshire': ['Manchester','Nashua','Concord'],
  'New Jersey': ['Newark','Jersey City','Paterson','Elizabeth','Trenton'],
  'New Mexico': ['Albuquerque','Las Cruces','Rio Rancho','Santa Fe'],
  'New York': ['New York City','Buffalo','Rochester','Yonkers','Syracuse','Albany'],
  'North Carolina': ['Charlotte','Raleigh','Greensboro','Durham','Winston-Salem'],
  'North Dakota': ['Fargo','Bismarck','Grand Forks'],
  'Ohio': ['Columbus','Cleveland','Cincinnati','Toledo','Akron','Dayton'],
  'Oklahoma': ['Oklahoma City','Tulsa','Norman','Broken Arrow'],
  'Oregon': ['Portland','Eugene','Salem','Gresham','Hillsboro'],
  'Pennsylvania': ['Philadelphia','Pittsburgh','Allentown','Erie'],
  'Rhode Island': ['Providence','Cranston','Warwick'],
  'South Carolina': ['Columbia','Charleston','North Charleston','Greenville'],
  'South Dakota': ['Sioux Falls','Rapid City','Aberdeen'],
  'Tennessee': ['Nashville','Memphis','Knoxville','Chattanooga','Clarksville'],
  'Texas': ['Houston','San Antonio','Dallas','Austin','Fort Worth','El Paso','Arlington','Corpus Christi','Plano'],
  'Utah': ['Salt Lake City','West Valley City','Provo','West Jordan','Orem'],
  'Vermont': ['Burlington','Essex','South Burlington'],
  'Virginia': ['Virginia Beach','Norfolk','Chesapeake','Richmond','Arlington','Alexandria'],
  'Washington': ['Seattle','Spokane','Tacoma','Vancouver','Bellevue','Kirkland'],
  'West Virginia': ['Charleston','Huntington','Morgantown'],
  'Wisconsin': ['Milwaukee','Madison','Green Bay','Kenosha'],
  'Wyoming': ['Cheyenne','Casper','Laramie'],
  'Washington D.C.': ['Washington D.C.'],
  'Ontario': ['Toronto','Ottawa','Mississauga','Brampton','Hamilton','London'],
  'Quebec': ['Montreal','Quebec City','Laval','Gatineau','Longueuil'],
  'British Columbia': ['Vancouver','Surrey','Burnaby','Richmond','Victoria','Kelowna'],
  'Alberta': ['Calgary','Edmonton','Red Deer','Lethbridge'],
  'Manitoba': ['Winnipeg','Brandon'],
  'Saskatchewan': ['Saskatoon','Regina'],
  'Nova Scotia': ['Halifax','Sydney','Dartmouth'],
  'New Brunswick': ['Moncton','Saint John','Fredericton'],
  'Newfoundland and Labrador': ["St. John's",'Mount Pearl','Corner Brook'],
  'Prince Edward Island': ['Charlottetown','Summerside'],
  'Northwest Territories': ['Yellowknife'],
  'Nunavut': ['Iqaluit'],
  'Yukon': ['Whitehorse'],
};

// ─── Due date villages ────────────────────────────────────────────────────────

const DUE_DATE_MONTHS = [
  'June 2026','July 2026','August 2026','September 2026','October 2026',
  'November 2026','December 2026','January 2027','February 2027','March 2027',
  'April 2027','May 2027','June 2027','July 2027','August 2027',
  'September 2027','October 2027','November 2027',
];

const DUE_DATE_VILLAGES: Village[] = DUE_DATE_MONTHS.map(m => ({
  id: `due_${toVillageId(m)}`,
  name: `${m} Moms`,
  emoji: '🤰',
  description: `Connect with moms due in ${m}`,
}));

// ─── Child age data ───────────────────────────────────────────────────────────

// Stage village IDs for each age band
const S = {
  newborn:       'stage_newborn',
  infant:        'stage_infant',
  toddler:       'stage_toddler',
  preschool:     'stage_preschool',
  school_age:    'stage_school_age',
  teen:          'stage_teen',
  adult:         'stage_adult_children',
} as const;

const CHILD_AGES: { label: string; id: string; name: string; emoji: string; stage: string }[] = [
  { label: 'Newborn (0–1 month)',  id: 'age_newborn', name: 'Newborn Parents',          emoji: '🍼', stage: S.newborn    },
  { label: '1 month',             id: 'age_1m',      name: '1 Month Old Parents',       emoji: '👶', stage: S.newborn    },
  { label: '2 months',            id: 'age_2m',      name: '2 Month Old Parents',       emoji: '👶', stage: S.newborn    },
  { label: '3 months',            id: 'age_3m',      name: '3 Month Old Parents',       emoji: '👶', stage: S.newborn    },
  { label: '4 months',            id: 'age_4m',      name: '4 Month Old Parents',       emoji: '👶', stage: S.infant     },
  { label: '5 months',            id: 'age_5m',      name: '5 Month Old Parents',       emoji: '👶', stage: S.infant     },
  { label: '6 months',            id: 'age_6m',      name: '6 Month Old Parents',       emoji: '👶', stage: S.infant     },
  { label: '7 months',            id: 'age_7m',      name: '7 Month Old Parents',       emoji: '👶', stage: S.infant     },
  { label: '8 months',            id: 'age_8m',      name: '8 Month Old Parents',       emoji: '👶', stage: S.infant     },
  { label: '9 months',            id: 'age_9m',      name: '9 Month Old Parents',       emoji: '👶', stage: S.infant     },
  { label: '10 months',           id: 'age_10m',     name: '10 Month Old Parents',      emoji: '👶', stage: S.infant     },
  { label: '11 months',           id: 'age_11m',     name: '11 Month Old Parents',      emoji: '👶', stage: S.infant     },
  { label: '12 months (1 year)',   id: 'age_12m',     name: '1 Year Old Parents',        emoji: '🎂', stage: S.infant     },
  { label: '15 months',           id: 'age_15m',     name: '15 Month Old Parents',      emoji: '🧒', stage: S.toddler    },
  { label: '18 months',           id: 'age_18m',     name: '18 Month Old Parents',      emoji: '🧒', stage: S.toddler    },
  { label: '21 months',           id: 'age_21m',     name: '21 Month Old Parents',      emoji: '🧒', stage: S.toddler    },
  { label: '2 years',             id: 'age_2y',      name: '2 Year Old Parents',        emoji: '🧒', stage: S.toddler    },
  { label: '2.5 years',           id: 'age_2_5y',    name: '2.5 Year Old Parents',      emoji: '🧒', stage: S.toddler    },
  { label: '3 years',             id: 'age_3y',      name: '3 Year Old Parents',        emoji: '🧒', stage: S.toddler    },
  { label: '4 years',             id: 'age_4y',      name: '4 Year Old Parents',        emoji: '🧒', stage: S.preschool  },
  { label: '5 years',             id: 'age_5y',      name: '5 Year Old Parents',        emoji: '🎒', stage: S.preschool  },
  { label: '6 years',             id: 'age_6y',      name: '6 Year Old Parents',        emoji: '🎒', stage: S.school_age },
  { label: '7 years',             id: 'age_7y',      name: '7 Year Old Parents',        emoji: '🎒', stage: S.school_age },
  { label: '8 years',             id: 'age_8y',      name: '8 Year Old Parents',        emoji: '🎒', stage: S.school_age },
  { label: '9 years',             id: 'age_9y',      name: '9 Year Old Parents',        emoji: '🎒', stage: S.school_age },
  { label: '10 years',            id: 'age_10y',     name: '10 Year Old Parents',       emoji: '🎒', stage: S.school_age },
  { label: '11 years',            id: 'age_11y',     name: '11 Year Old Parents',       emoji: '🎒', stage: S.school_age },
  { label: '12 years',            id: 'age_12y',     name: '12 Year Old Parents',       emoji: '📚', stage: S.school_age },
  { label: '13 years',            id: 'age_13y',     name: '13 Year Old Parents',       emoji: '📚', stage: S.teen       },
  { label: '14 years',            id: 'age_14y',     name: '14 Year Old Parents',       emoji: '📚', stage: S.teen       },
  { label: '15 years',            id: 'age_15y',     name: '15 Year Old Parents',       emoji: '📚', stage: S.teen       },
  { label: '16 years',            id: 'age_16y',     name: '16 Year Old Parents',       emoji: '📚', stage: S.teen       },
  { label: '17 years',            id: 'age_17y',     name: '17 Year Old Parents',       emoji: '📚', stage: S.teen       },
  { label: '18 years',            id: 'age_18y',     name: '18 Year Old Parents',       emoji: '🎓', stage: S.teen       },
  { label: 'Adult (18+)',         id: 'age_adult',   name: 'Parents of Adult Children', emoji: '🎓', stage: S.adult      },
];

const CHILD_AGE_VILLAGES: Village[] = CHILD_AGES.map(a => ({
  id: a.id, name: a.name, emoji: a.emoji,
  description: `Connect with parents of ${a.label.toLowerCase()}s`,
  hidden: true,
}));

const LOCATION_VILLAGES: Village[] = [
  ...COUNTRIES.filter(c => c !== 'Other').map(c => ({
    id: `country_${toVillageId(c)}`, name: `${c} Village`,
    emoji: '🌍', description: `Connect with parents from ${c}`, hidden: true,
  })),
  ...Object.values(STATES_BY_COUNTRY).flat().map(s => ({
    id: `state_${toVillageId(s)}`, name: `${s} Village`,
    emoji: '📍', description: `Connect with parents across ${s}`, hidden: true,
  })),
  ...Object.entries(CITIES_BY_STATE).flatMap(([, cities]) =>
    cities.map(city => ({
      id: `city_${toVillageId(city)}`, name: `${city} Village`,
      emoji: '🏙️', description: `Connect with parents in ${city}`, hidden: true,
    }))
  ),
];

const VILLAGES: Village[] = [
  // ── Loss parent villages
  { id: 'bereaved_parents',      name: 'Bereaved Parents Village',                   emoji: '🕊️', description: 'A safe, compassionate space for parents who have experienced the loss of a child or pregnancy' },
  { id: 'pregnancy_loss',        name: 'Pregnancy Loss Village',                     emoji: '🌸', description: 'Support for parents who have experienced any form of pregnancy loss' },
  { id: 'miscarriage_parents',   name: 'Miscarriage Parents Village',                emoji: '💜', description: '1 in 4 pregnancies end in miscarriage — you are not alone' },
  { id: 'ectopic_loss',          name: 'Ectopic & Molar Pregnancy Loss',             emoji: '🌸', description: 'Support for parents who experienced ectopic or molar pregnancy loss', hidden: true },
  { id: 'tfmr_parents',          name: 'TFMR Parents Village',                       emoji: '💙', description: 'A safe and judgment-free space for parents who experienced termination for medical reasons', hidden: true },
  { id: 'stillbirth_parents',    name: 'Stillbirth Parents Village',                 emoji: '🕊️', description: 'Support and community for stillbirth parents' },
  { id: 'infant_loss',           name: 'Infant Loss Village',                        emoji: '💙', description: 'Support for parents who have lost an infant' },
  { id: 'sids_parents',          name: 'SIDS Parents Village',                       emoji: '💙', description: 'Community for families affected by Sudden Infant Death Syndrome' },
  { id: 'sudc_parents',          name: 'SUDC Parents Village',                       emoji: '💙', description: 'Community for families affected by Sudden Unexplained Death in Childhood', hidden: true },
  { id: 'sads_parents',          name: 'SADS Parents Village',                       emoji: '💙', description: 'Community for families affected by Sudden Arrhythmia Death Syndrome', hidden: true },
  { id: 'pediatric_cancer_loss', name: 'Pediatric Cancer Loss Village',              emoji: '💛', description: 'A community for parents who have lost a child to cancer', hidden: true },
  { id: 'child_loss',            name: 'Child Loss Village',                         emoji: '🕊️', description: 'Support for parents who have lost a child at any age' },
  { id: 'boy_parents',  name: "Parents of Boys Village",   emoji: '💙', description: 'A community for parents raising baby boys' },
  { id: 'girl_parents', name: "Parents of Girls Village",  emoji: '🩷', description: 'A community for parents raising baby girls' },
  { id: 'twins',           name: 'Parents of Twins',           emoji: '👯', description: 'Double the love, double the fun' },
  { id: 'identical_twins', name: 'Parents of Identical Twins',  emoji: '🪞', description: 'Two of a kind — raising identical twins' },
  { id: 'fraternal_twins', name: 'Parents of Fraternal Twins',  emoji: '👫', description: 'Two unique souls, one pregnancy' },
  { id: 'triplets',        name: 'Parents of Triplets',         emoji: '🎉', description: 'Triple the chaos, triple the joy' },
  { id: 'quadruplets',     name: 'Parents of Quadruplets',      emoji: '🍀', description: 'Four at once — you are superhuman' },
  { id: 'quintuplets',     name: 'Parents of Quintuplets',      emoji: '⭐', description: 'Five at once — an absolute legend' },
  { id: 'kids_1',  name: 'Parent of 1 Kid',   emoji: '1️⃣', description: 'Raising your one and only' },
  { id: 'kids_2',  name: 'Parent of 2 Kids',  emoji: '2️⃣', description: 'Life with two little ones' },
  { id: 'kids_3',  name: 'Parent of 3 Kids',  emoji: '3️⃣', description: 'The wonderful chaos of three' },
  { id: 'kids_4',  name: 'Parent of 4 Kids',  emoji: '4️⃣', description: 'A full and busy household of four' },
  { id: 'kids_5',  name: 'Parent of 5 Kids',  emoji: '5️⃣', description: 'Five is a party' },
  { id: 'kids_6',  name: 'Parent of 6 Kids',  emoji: '6️⃣', description: 'Six and thriving' },
  { id: 'kids_7',  name: 'Parent of 7 Kids',  emoji: '7️⃣', description: 'Lucky number seven' },
  { id: 'kids_8',  name: 'Parent of 8 Kids',  emoji: '8️⃣', description: 'A household of eight' },
  { id: 'kids_9',  name: 'Parent of 9 Kids',  emoji: '9️⃣', description: 'Nine strong' },
  { id: 'kids_10',       name: 'Parent of 10 Kids',     emoji: '🔟', description: 'Ten kids and counting — you are a legend' },
  { id: 'large_family',  name: 'Large Family Village',   emoji: '🏠', description: 'For families with 11 or more children' },
  { id: 'super_multiples', name: 'Parents of Sextuplets+', emoji: '🌟', description: 'Sextuplets and beyond — an extraordinary journey' },
  { id: 'stage_newborn',        name: 'Newborn Stage Village',       emoji: '🍼', description: 'Parents in the newborn stage (0–3 months)' },
  { id: 'stage_infant',         name: 'Infant Stage Village',        emoji: '👶', description: 'Parents of infants (4–12 months)' },
  { id: 'stage_toddler',        name: 'Toddler Stage Village',       emoji: '🧒', description: 'Parents of toddlers (1–3 years)' },
  { id: 'stage_preschool',      name: 'Preschool Stage Village',     emoji: '🎨', description: 'Parents of preschoolers (4–5 years)' },
  { id: 'stage_school_age',     name: 'School-Age Stage Village',    emoji: '🎒', description: 'Parents of school-age children (6–12 years)' },
  { id: 'stage_teen',           name: 'Teenager Stage Village',      emoji: '📚', description: 'Parents of teenagers (13–18 years)' },
  { id: 'stage_adult_children', name: 'Parents of Adult Children',   emoji: '🎓', description: 'Parenting doesn\'t stop at 18' },
  { id: 'due_date',    name: 'Due Date Moms',         emoji: '🤰', description: 'Connect with parents due the same month' },
  { id: 'first_time',        name: 'First Time Parents',        emoji: '⭐', description: 'Navigating parenthood for the first time' },
  { id: 'one_and_done',      name: 'One and Done Village',      emoji: '1️⃣', description: 'Intentionally raising an only child — loving every moment of it' },
  { id: 'family_complete',   name: 'Family Complete Village',   emoji: '✅', description: 'Our family is exactly the size it\'s meant to be — done and loving it' },
  { id: 'only_child_parents', name: 'Only Child Parents Village', emoji: '⭐', description: 'Raising an only child — the unique joys and questions that come with it', hidden: true },
  { id: 'single_mom',  name: 'Single Moms',            emoji: '💪', description: 'Support for single mothers' },
  { id: 'working_mom', name: 'Working Moms',           emoji: '👩‍💼', description: 'Balancing career and parenthood' },
  { id: 'autism',      name: 'Autism Parents',         emoji: '🧩', description: 'Support and resources for autism families' },
  { id: 'nicu',        name: 'NICU Warriors',          emoji: '🏥', description: 'For families who have been through the NICU' },
  { id: 'postpartum',  name: 'Postpartum Support',     emoji: '💛', description: 'Mental health and recovery after birth' },
  { id: 'ppd_parents',                  name: 'Postpartum Depression (PPD) Village',         emoji: '💛', description: 'PPD is real, common, and treatable — a safe, non-judgmental space for every stage of the journey' },
  { id: 'ppa_parents',                  name: 'Postpartum Anxiety (PPA) Village',            emoji: '💛', description: 'The racing thoughts, the what-ifs, the constant worry — PPA is real and you are not alone' },
  { id: 'pmad_parents',                 name: 'Perinatal Mood & Anxiety Disorders Village',  emoji: '💛', description: 'PMAD parents — PPD, PPA, PPOCD, and all perinatal mental health experiences' },
  { id: 'postpartum_ocd_parents',       name: 'Postpartum OCD Village',                      emoji: '💛', description: 'Postpartum OCD — intrusive thoughts, compulsions, and the courage it takes to talk about it', hidden: true },
  { id: 'postpartum_rage_parents',      name: 'Postpartum Rage Village',                     emoji: '🔥', description: 'The anger nobody talks about — postpartum rage is real and you are not a bad parent', hidden: true },
  { id: 'postpartum_psychosis_survivors', name: 'Postpartum Psychosis Survivors Village',    emoji: '💙', description: 'Survivors of postpartum psychosis — healing, recovery, and a community that understands', hidden: true },
  { id: 'prenatal_depression_parents',  name: 'Prenatal Depression & Anxiety Village',       emoji: '💛', description: 'Mental health challenges during pregnancy — you don\'t have to wait until postpartum to get support', hidden: true },
  { id: 'paternal_ppd_parents',         name: 'Paternal & Partner PPD Village',              emoji: '💙', description: 'Postpartum depression in dads, co-parents, and non-birthing partners — it\'s real and it matters', hidden: true },
  { id: 'parent_mental_health_parents', name: 'Parental Mental Health Village',              emoji: '💛', description: 'Parents navigating anxiety, depression, or mental health challenges — supporting yourself to support your family' },
  { id: 'chronic_mental_health_parents', name: 'Parenting With a Chronic Mental Health Condition', emoji: '💙', description: 'Managing a pre-existing or chronic mental health condition while raising children', hidden: true },
  { id: 'military',    name: 'Military Families',      emoji: '🎖️', description: 'Parenting through deployments and military life' },
  { id: 'multiples',   name: 'Twins & Multiples',      emoji: '👯', description: 'Double (or triple!) the love' },
  { id: 'teen_parent', name: 'Teen Parents',           emoji: '🌟', description: 'Young parents supporting each other' },
  { id: 'lgbtq',       name: 'LGBTQ+ Families',        emoji: '🌈', description: 'Pride and joy in every family form' },
  { id: 'grandparent',       name: 'Grandparent Caregivers',      emoji: '🌻', description: 'Grandparents raising grandchildren' },
  { id: 'ivf_parents',       name: 'IVF & Fertility Journey',      emoji: '🔬', description: 'Parents who walked the fertility treatment path' },
  { id: 'adoptive_parents',  name: 'Adoptive Parents',             emoji: '💛', description: 'Families built through the gift of adoption' },
  { id: 'foster_parents',    name: 'Foster Parents',               emoji: '🏠', description: 'Opening your home and heart through foster care' },
  { id: 'surrogacy_parents', name: 'Surrogacy Parents',            emoji: '🤝', description: 'Families created with the help of a surrogate' },
  { id: 'donor_conception',  name: 'Donor Conception Parents',     emoji: '🧬', description: 'Families formed through egg, sperm, or embryo donation' },
  { id: 'step_parents',      name: 'Step Parents',                 emoji: '⭐', description: 'Navigating the beautiful journey of step-parenting' },
  { id: 'blended_family',        name: 'Blended Family Village',                      emoji: '🧩', description: 'Two families becoming one' },
  { id: 'iui_parents',           name: 'IUI Parents Village',                         emoji: '🔬', description: 'Parents who conceived through intrauterine insemination' },
  { id: 'intended_parents',      name: 'Intended Parents Village',                    emoji: '🤝', description: 'Families created through surrogacy — intended parents together' },
  { id: 'aunt_uncle_raising',    name: 'Aunt / Uncle Raising Nieces & Nephews',       emoji: '💛', description: 'Aunts and uncles stepping up to raise family' },
  { id: 'kinship_family',        name: 'Kinship Family Village',                      emoji: '🏠', description: 'Family members raising children in kinship care arrangements' },
  // ── Feeding method villages
  { id: 'breastfeeding',               name: 'Breastfeeding Village',                       emoji: '🤱', description: 'Support and solidarity for breastfeeding parents' },
  { id: 'breastfeeding_oversupply',    name: 'Oversupply Breastfeeding Village',            emoji: '🤱', description: 'Navigating an oversupply of breast milk', hidden: true },
  { id: 'breastfeeding_just_enough',   name: 'Just Enougher Breastfeeding Village',         emoji: '🤱', description: 'Making exactly enough — the just enoughers community', hidden: true },
  { id: 'breastfeeding_low_supply',    name: 'Low Supply Breastfeeding Village',            emoji: '🤱', description: 'Navigating low milk supply together', hidden: true },
  { id: 'extended_breastfeeding',      name: 'Extended Breastfeeding Village',              emoji: '🤱', description: 'Breastfeeding beyond one year — a supportive space', hidden: true },
  { id: 'weaning',                     name: 'Weaning Village',                             emoji: '🌱', description: 'Parents navigating the weaning journey', hidden: true },
  { id: 'nursing_strike',              name: 'Nursing Strike Village',                      emoji: '🤱', description: 'Surviving and navigating nursing strikes', hidden: true },
  { id: 'formula_feeding',             name: 'Formula Feeding Village',                     emoji: '🍼', description: 'Fed is best — a community for formula feeding parents' },
  { id: 'specialty_formula',           name: 'Specialty Formula Parents',                   emoji: '🍼', description: 'Parents using specialty formula for allergies or intolerances', hidden: true },
  { id: 'hypoallergenic_formula',      name: 'Hypoallergenic Formula Parents',              emoji: '🍼', description: 'Nutramigen, Alimentum and other hypoallergenic formula families', hidden: true },
  { id: 'amino_acid_formula',          name: 'Amino Acid Formula Parents',                  emoji: '🍼', description: 'Elecare, Neocate, and amino acid formula families', hidden: true },
  { id: 'donor_milk',                  name: 'Donor Milk Village',                          emoji: '🤱', description: 'Families using donor breast milk', hidden: true },
  { id: 'exclusive_pumping',           name: 'Exclusive Pumping Village',                   emoji: '🫙', description: 'The EP community — exclusively pumping parents' },
  { id: 'ep_oversupply',               name: 'EP Oversupply Village',                       emoji: '🫙', description: 'Exclusive pumpers with an oversupply', hidden: true },
  { id: 'ep_just_enough',              name: 'EP Just Enougher Village',                    emoji: '🫙', description: 'Exclusive pumpers making just enough', hidden: true },
  { id: 'ep_low_supply',               name: 'EP Low Supply Village',                       emoji: '🫙', description: 'Exclusive pumpers navigating low supply', hidden: true },
  { id: 'combination_feeding',         name: 'Combination Feeding Village',                 emoji: '🍼', description: 'Breastfeeding and formula — a community for combo feeders' },
  { id: 'gtube_parents',               name: 'G-Tube Parents Village',                      emoji: '💊', description: 'Parents of children with a gastrostomy tube', hidden: true },
  { id: 'gjtube_parents',              name: 'GJ-Tube Parents Village',                     emoji: '💊', description: 'Parents of children with a gastrojejunostomy tube', hidden: true },
  { id: 'ngtube_parents',              name: 'NG-Tube Parents Village',                     emoji: '💊', description: 'Parents of children with a nasogastric tube', hidden: true },
  { id: 'tube_transitioning',          name: 'Transitioning Off Tube Feeding',              emoji: '🌱', description: 'Families working toward oral feeding after tube dependence', hidden: true },
  { id: 'starting_solids',             name: 'Starting Solids Village',                     emoji: '🥄', description: 'The exciting and messy world of starting solid foods', hidden: true },
  { id: 'baby_led_weaning',            name: 'Baby-Led Weaning Village',                    emoji: '🥦', description: 'BLW families — letting babies lead the way with food' },
  { id: 'puree_feeding',               name: 'Puree Feeding Village',                       emoji: '🥣', description: 'Spoon feeding and puree parents', hidden: true },
  { id: 'food_allergies',              name: 'Food Allergy Parents Village',                emoji: '⚠️', description: 'Navigating childhood food allergies together' },
  // ── Feeding challenges
  { id: 'feeding_therapy',      name: 'Feeding Therapy Village',                      emoji: '🥄', description: 'Parents navigating feeding therapy with their child' },
  { id: 'tube_feeding',         name: 'Tube Feeding Village',                         emoji: '💊', description: 'G-tube, NG-tube, and tube feeding families' },
  { id: 'oral_aversion',        name: 'Oral Aversion & Food Refusal Village',         emoji: '😮', description: 'Navigating oral aversion and extreme food refusal together' },
  { id: 'failure_to_thrive',    name: 'Failure to Thrive Village',                    emoji: '📈', description: 'Support for families dealing with failure to thrive' },
  { id: 'picky_eater',          name: 'Picky Eater Parents Village',                  emoji: '🥦', description: 'You are not alone in the picky eater struggle' },
  // ── Sleep challenges
  { id: 'sleep_training',       name: 'Sleep Training Village',                       emoji: '😴', description: 'Methods, support, and solidarity for sleep training parents' },
  { id: 'night_waking',         name: 'Night Waking Village',                         emoji: '🌙', description: 'For the parents up at 2am — you have company' },
  { id: 'sleep_regression',     name: 'Sleep Regression Village',                     emoji: '😩', description: 'Surviving sleep regressions together' },
  { id: 'cosleeping',           name: 'Co-sleeping & Bedsharing Village',             emoji: '🛏️', description: 'Community for co-sleeping and bedsharing families' },
  { id: 'early_rising',         name: 'Early Riser Parents Village',                  emoji: '🌅', description: 'For the parents whose toddler is up at 5am' },
  { id: 'sleep_onset_parents',  name: 'Sleep Onset Struggles Village',                emoji: '🌙', description: 'Kids who fight bedtime, take forever to fall asleep, or won\'t settle — solidarity here', hidden: true },
  { id: 'nap_refusal_parents',  name: 'Nap Refusal & Short Nap Village',              emoji: '😴', description: 'The nap strike is real — parents navigating nap refusal and the 30-minute intruder', hidden: true },
  { id: 'ferber_parents',       name: 'Ferber Method Parents Village',                emoji: '😴', description: 'Families using or who used graduated extinction / the Ferber method', hidden: true },
  { id: 'cio_parents',          name: 'Cry It Out (CIO) Parents Village',             emoji: '😴', description: 'Full extinction / CIO families — judgment-free support', hidden: true },
  { id: 'gentle_sleep_parents', name: 'Gentle Sleep Training Parents Village',        emoji: '🌿', description: 'No-cry, gentle, and attachment-based sleep approaches', hidden: true },
  { id: 'sleep_consultant_parents', name: 'Sleep Consultant Parents Village',         emoji: '💤', description: 'Working with a sleep consultant — the investment, the plan, and the results', hidden: true },
  { id: 'bedsharing_parents',   name: 'Intentional Bedsharing Village',               emoji: '🛏️', description: 'Families who choose informed, intentional bedsharing — safe sleep and community', hidden: true },
  { id: 'room_sharing_parents', name: 'Room Sharing Parents Village',                 emoji: '🛏️', description: 'Baby in your room but on a separate surface — navigating the transition', hidden: true },
  // ── Behavioral & developmental challenges
  { id: 'behavior_support',     name: 'Behavior Support Village',                     emoji: '🤝', description: 'Support for parents navigating behavioral challenges' },
  { id: 'tantrum_support',      name: 'Tantrums & Meltdowns Village',                 emoji: '🌊', description: 'Riding the waves of big emotions together' },
  { id: 'odd_parents',          name: 'ODD Parents Village',                          emoji: '💪', description: 'Parenting children with Oppositional Defiant Disorder' },
  { id: 'aba_parents',          name: 'ABA Therapy Parents Village',                  emoji: '🧩', description: 'Parents navigating the ABA therapy journey', hidden: true },
  { id: 'self_injury_parents',  name: 'Self-Injurious Behavior Parents Village',      emoji: '💙', description: 'Parents supporting children who engage in self-injurious behavior', hidden: true },
  { id: 'night_terrors',        name: 'Night Terrors & Nightmares Village',           emoji: '🌙', description: 'Parents navigating night terrors and nightmares', hidden: true },
  { id: 'speech_delay',         name: 'Speech Delay Village',                         emoji: '💬', description: 'Parents supporting children with speech and language delays' },
  { id: 'developmental_delay',  name: 'Developmental Delay Village',                  emoji: '🌱', description: 'Every child grows at their own pace — support for delay families' },
  { id: 'potty_training',       name: 'Potty Training Village',                       emoji: '🚽', description: 'The highs, lows, and everything in between of potty training' },
  { id: 'child_anxiety',        name: 'Child Anxiety & Mental Health Village',        emoji: '💛', description: "Supporting children's mental health and anxiety" },
  { id: 'school_refusal',       name: 'School Refusal Village',                       emoji: '🎒', description: 'Families navigating school refusal and avoidance' },
  { id: 'gifted_parents',       name: 'Gifted Child Parents Village',                 emoji: '⭐', description: 'Raising gifted and twice-exceptional children' },
  // ── Challenge-specific support villages
  { id: 'arfid_parents',        name: 'ARFID Parents Village',                        emoji: '🥄', description: 'Parents navigating Avoidant / Restrictive Food Intake Disorder' },
  { id: 'tube_weaning',         name: 'Tube Weaning Village',                         emoji: '🌱', description: 'Families working toward oral eating after tube feeding', hidden: true },
  { id: 'high_medical_needs',   name: 'High Medical Needs Parents',                   emoji: '🏥', description: 'Parents managing a high volume of medical appointments and care' },
  { id: 'multiple_therapies',   name: 'Multiple Therapies Parents',                   emoji: '🗓️', description: 'Families juggling OT, PT, SLP, and more', hidden: true },
  { id: 'pending_diagnosis',    name: 'Awaiting Diagnosis Parents',                   emoji: '🔍', description: 'Parents in the diagnostic waiting room — you are not alone' },
  { id: 'medically_complex',    name: 'Medically Complex Child Village',              emoji: '💙', description: 'Parents of medically complex or medically fragile children', hidden: true },
  { id: 'home_health_nursing',  name: 'Home Health Nursing Families',                 emoji: '🏠', description: 'Families with home health nurses involved in their child\'s care', hidden: true },
  { id: 'childcare_waitlist',   name: 'Childcare Waitlist Parents',                   emoji: '⏳', description: 'Parents navigating long childcare waitlists and availability struggles', hidden: true },
  { id: 'gross_motor_delay',    name: 'Gross Motor Delay Parents Village',            emoji: '🌱', description: 'Parents supporting children with gross motor and walking delays', hidden: true },
  { id: 'special_needs_childcare', name: 'Special Needs Childcare Search Village',   emoji: '🏫', description: 'Parents searching for childcare that meets their child\'s needs', hidden: true },
  { id: 'inclusive_childcare',  name: 'Inclusive Childcare & School Search',          emoji: '🏫', description: 'Finding inclusive daycare and school environments', hidden: true },
  { id: 'caregiver_burnout',    name: 'Caregiver Burnout Village',                    emoji: '🌿', description: 'Parents experiencing caregiver burnout — you deserve support too' },
  { id: 'financial_strain_parents', name: 'Financial Strain Parents Village',         emoji: '💸', description: 'Navigating the financial weight of raising a child' },
  { id: 'insurance_navigation', name: 'Insurance & Benefits Navigation Village',      emoji: '📋', description: 'Navigating SSI, insurance denials, and disability benefits' },
  { id: 'isolated_parents',     name: 'Isolated Parents Village',                     emoji: '🌍', description: 'Parents who feel alone in their journey — you\'ve found your people' },
  { id: 'iep_parents',          name: 'IEP Parents Village',                          emoji: '📚', description: 'Navigating IEPs and special education together' },
  { id: 'systems_navigation',   name: 'Systems Navigation Village',                   emoji: '🗺️', description: 'Parents navigating school systems, medical systems, and insurance' },
  { id: 'autism_l1_girls',         name: 'Autism Level 1 Girls Village',           emoji: '💜', description: 'Support for girls diagnosed with Autism Level 1' },
  { id: 'autism_l1_late_diagnosis', name: 'Autism Level 1 — Late / Missed Diagnosis', emoji: '💜', description: 'For parents whose child received a late or missed Autism Level 1 diagnosis' },
  { id: 'autism_l1_boys',          name: 'Autism Level 1 Boys',                      emoji: '💙', description: 'Support for boys diagnosed with Autism Level 1' },
  // ── Birth type villages
  { id: 'vaginal_birth_parents',     name: 'Vaginal Birth Parents Village',            emoji: '👶', description: 'Parents who gave birth vaginally — sharing experiences, recovery, and support', hidden: true },
  { id: 'unmedicated_birth_parents', name: 'Unmedicated Birth Village',                emoji: '🌿', description: 'Unmedicated and natural birth parents — the experience, the recovery, and the community', hidden: true },
  { id: 'home_birth_parents',        name: 'Home Birth Parents Village',               emoji: '🏠', description: 'Families who chose or are planning a home birth — midwives, preparation, and community' },
  { id: 'birth_center_parents',      name: 'Birth Center Parents Village',             emoji: '🌸', description: 'Families who birthed or are planning to birth at a birth center', hidden: true },
  { id: 'water_birth_parents',       name: 'Water Birth Village',                      emoji: '💧', description: 'Water birth parents — the experience, preparation, and recovery', hidden: true },
  { id: 'induced_labor_parents',     name: 'Induced Labor Parents Village',            emoji: '⏰', description: 'Parents who experienced an induction — the waiting, the process, and the arrival', hidden: true },
  { id: 'csection_parents',          name: 'C-Section Parents Village',                emoji: '💙', description: 'C-section parents — recovery, advocacy, and community for all cesarean families' },
  { id: 'planned_csection_parents',  name: 'Planned C-Section Parents Village',        emoji: '📅', description: 'Families who planned their C-section — preparation, recovery, and solidarity', hidden: true },
  { id: 'emergency_csection_parents', name: 'Emergency C-Section Parents Village',    emoji: '🚨', description: 'Parents who experienced an emergency C-section — processing, healing, and community' },
  { id: 'vbac_parents',              name: 'VBAC Parents Village',                     emoji: '💪', description: 'Vaginal Birth After Cesarean — the journey, the decision, and the community' },
  { id: 'vbac_planning_parents',     name: 'Planning a VBAC Village',                 emoji: '💪', description: 'Preparing for a VBAC — finding providers, navigating hospital policies, and building confidence', hidden: true },
  { id: 'birth_trauma_parents',      name: 'Birth Trauma Village',                    emoji: '💛', description: 'Parents processing a traumatic birth experience — you are not alone and your experience is valid' },
  { id: 'birth_ptsd_parents',        name: 'Birth-Related PTSD & Anxiety Village',    emoji: '💛', description: 'Navigating PTSD, anxiety, and fear following a traumatic birth', hidden: true },
  { id: 'postpartum_hemorrhage_parents', name: 'Postpartum Hemorrhage Survivors Village', emoji: '❤️', description: 'Parents who survived a postpartum hemorrhage — healing, processing, and finding community', hidden: true },
  { id: 'preemie_periviable',    name: 'Periviable Preemie Village',                        emoji: '🌟', description: 'Families navigating birth under 22 weeks' },
  { id: 'preemie_extreme',       name: 'Extreme Prematurity Village (22–24 weeks)',          emoji: '🏥', description: 'For families of babies born at 22–24 weeks' },
  { id: 'preemie_moderate',      name: 'Moderate Prematurity Village (25–32 weeks)',         emoji: '🏥', description: 'For families of babies born at 25–32 weeks' },
  { id: 'preemie_late',          name: 'Late Preterm Village (33–36 weeks)',                 emoji: '🏥', description: 'For families of babies born at 33–36 weeks' },
  // ── CP general + subtypes
  { id: 'chd_general',           name: 'CHD Warriors Village',                              emoji: '❤️', description: 'A community for all congenital heart defect families' },
  { id: 'spina_bifida',          name: 'Spina Bifida Village',                              emoji: '🦋', description: 'Support and community for spina bifida families' },
  { id: 'hydrocephalus',         name: 'Hydrocephalus Village',                             emoji: '🧠', description: 'Families navigating hydrocephalus together' },
  { id: 'epilepsy',              name: 'Epilepsy & Seizure Parents Village',                emoji: '⚡', description: 'Support for families managing epilepsy and seizure disorders' },
  { id: 't1d_parents',           name: 'Type 1 Diabetes Parents Village',                  emoji: '💉', description: 'Raising kids with T1D — you are not alone' },
  { id: 'cystic_fibrosis',       name: 'Cystic Fibrosis Families Village',                 emoji: '🫁', description: 'Strength and support for CF families' },
  { id: 'sma_parents',           name: 'SMA Parents Village',                              emoji: '💪', description: 'Families navigating Spinal Muscular Atrophy' },
  { id: 'muscular_dystrophy',    name: 'Muscular Dystrophy Families Village',              emoji: '💙', description: 'United in strength — MD families together' },
  { id: 'sickle_cell',           name: 'Sickle Cell Disease Village',                      emoji: '🩸', description: 'Community for sickle cell disease families' },
  { id: 'fragile_x',             name: 'Fragile X Syndrome Village',                       emoji: '🧬', description: 'Support for Fragile X families' },
  { id: 'rett_syndrome',         name: 'Rett Syndrome Village',                            emoji: '💜', description: 'Community for Rett Syndrome families' },
  { id: 'prader_willi',          name: 'Prader-Willi Syndrome Village',                    emoji: '🌟', description: 'Support and resources for PWS families' },
  { id: 'angelman',              name: 'Angelman Syndrome Village',                        emoji: '😊', description: 'Happy hearts — Angelman Syndrome families together' },
  { id: 'tuberous_sclerosis',    name: 'Tuberous Sclerosis Village',                       emoji: '🌿', description: 'TSC families supporting each other' },
  { id: 'digeorge_22q',          name: '22q11.2 Deletion / DiGeorge Village',             emoji: '🧩', description: 'Community for 22q11.2 deletion families' },
  { id: 'williams_syndrome',     name: 'Williams Syndrome Village',                        emoji: '🎵', description: 'Williams Syndrome families — music in every heart' },
  { id: 'eds_parents',           name: 'Ehlers-Danlos Syndrome Families',                  emoji: '🦓', description: 'EDS families navigating life with connective tissue differences' },
  { id: 'charge_syndrome',       name: 'CHARGE Syndrome Village',                          emoji: '💛', description: 'CHARGE Syndrome families united' },
  { id: 'cleft_lip_palate',      name: 'Cleft Lip & Palate Village',                      emoji: '💬', description: 'Community for cleft lip and palate families' },
  { id: 'osteogenesis_imperfecta', name: 'Osteogenesis Imperfecta Village',               emoji: '🦴', description: 'Brittle bone disease families — stronger together' },
  // ── CP subtypes (hidden — found via quiz or search)
  { id: 'cp_hemiplegia_left',    name: 'CP Hemiplegia — Left Side Village',               emoji: '🧠', description: 'Parents of children with left-side hemiplegia CP', hidden: true },
  { id: 'cp_hemiplegia_right',   name: 'CP Hemiplegia — Right Side Village',              emoji: '🧠', description: 'Parents of children with right-side hemiplegia CP', hidden: true },
  { id: 'cp_diplegia',           name: 'CP Diplegia Village',                             emoji: '🧠', description: 'Parents of children with diplegic cerebral palsy', hidden: true },
  { id: 'cp_quadriplegia',       name: 'CP Quadriplegia Village',                         emoji: '🧠', description: 'Parents of children with quadriplegic cerebral palsy', hidden: true },
  { id: 'cp_ataxic',             name: 'Ataxic CP Village',                               emoji: '🧠', description: 'Parents of children with ataxic cerebral palsy', hidden: true },
  { id: 'cp_dyskinetic',         name: 'Dyskinetic / Athetoid CP Village',                emoji: '🧠', description: 'Parents of children with dyskinetic cerebral palsy', hidden: true },
  // ── CHD subtypes (hidden — found via quiz or search)
  { id: 'chd_hlhs',              name: 'HLHS Village',                                    emoji: '❤️', description: 'Hypoplastic Left Heart Syndrome families', hidden: true },
  { id: 'chd_tof',               name: 'Tetralogy of Fallot Village',                     emoji: '❤️', description: 'TOF families supporting each other', hidden: true },
  { id: 'chd_tga',               name: 'TGA Village',                                     emoji: '❤️', description: 'Transposition of the Great Arteries families', hidden: true },
  { id: 'chd_vsd',               name: 'VSD Village',                                     emoji: '❤️', description: 'Ventricular Septal Defect families', hidden: true },
  { id: 'chd_asd_heart',         name: 'ASD (Heart) Village',                             emoji: '❤️', description: 'Atrial Septal Defect families', hidden: true },
  { id: 'chd_coarctation',       name: 'Coarctation of the Aorta Village',               emoji: '❤️', description: 'Families navigating aortic coarctation', hidden: true },
  { id: 'chd_pulmonary_atresia', name: 'Pulmonary Atresia Village',                       emoji: '❤️', description: 'Pulmonary Atresia families', hidden: true },
  { id: 'chd_avsd',              name: 'AVSD Village',                                    emoji: '❤️', description: 'Atrioventricular Septal Defect families', hidden: true },
  { id: 'chd_other',             name: 'Congenital Heart Defect Village',                 emoji: '❤️', description: 'Other congenital heart defect families', hidden: true },
  { id: 'autism_l2',            name: 'Autism Level 2 — Intellectual Disability',    emoji: '💜', description: 'Navigating Autism Level 2 with intellectual disability' },
  { id: 'autism_l3',            name: 'Autism Level 3 — Self-Injury Support',        emoji: '💜', description: 'Support for families navigating Autism Level 3 with self-injury' },
  { id: 'ds_general',           name: 'Down Syndrome Parents',                       emoji: '💛', description: 'A community for all Down Syndrome families' },
  { id: 'ds_trisomy21',         name: 'Trisomy 21 Village',                          emoji: '💛', description: 'Families navigating standard Trisomy 21 Down Syndrome' },
  { id: 'ds_translocation',     name: 'Translocation Down Syndrome Village',         emoji: '💛', description: 'Families with Translocation Down Syndrome' },
  { id: 'ds_mosaic',            name: 'Mosaic Down Syndrome Village',                emoji: '💛', description: 'Families with Mosaic Down Syndrome' },
  { id: 'ds_dual_diagnosis',    name: 'Dual Diagnosis Down Syndrome Village',        emoji: '💛', description: 'Navigating Down Syndrome alongside another diagnosis' },
  { id: 'adhd_parents',         name: 'ADHD Parents Village',                        emoji: '⚡', description: 'Raising children with ADHD together' },
  { id: 'adhd_inattentive',     name: 'Inattentive ADHD (ADD) Parents',              emoji: '⚡', description: 'Parents of children with inattentive-type ADHD', hidden: true },
  { id: 'adhd_hyperactive',     name: 'Hyperactive-Impulsive ADHD Parents',          emoji: '⚡', description: 'Parents of children with hyperactive-impulsive ADHD', hidden: true },
  { id: 'adhd_combined',        name: 'Combined ADHD Parents',                       emoji: '⚡', description: 'Parents of children with combined-type ADHD', hidden: true },
  { id: 'spd_parents',          name: 'Sensory Processing Parents',                  emoji: '🌈', description: 'Support for families navigating sensory processing differences' },
  { id: 'spd_tactile',          name: 'Tactile Sensitivity Parents',                 emoji: '🤚', description: 'Parents of children with tactile sensitivity to touch and textures', hidden: true },
  { id: 'spd_auditory',         name: 'Auditory Sensitivity Parents',                emoji: '👂', description: 'Parents of children with sound sensitivity', hidden: true },
  { id: 'spd_visual',           name: 'Visual Sensitivity Parents',                  emoji: '👁️', description: 'Parents of children with sensitivity to light and visual motion', hidden: true },
  { id: 'spd_oral',             name: 'Oral / Gustatory Sensitivity Parents',        emoji: '👅', description: 'Parents navigating taste and food texture sensitivities', hidden: true },
  { id: 'spd_olfactory',        name: 'Olfactory Sensitivity Parents',               emoji: '👃', description: 'Parents of children with smell sensitivities', hidden: true },
  { id: 'spd_proprioception',   name: 'Proprioceptive Differences Parents',          emoji: '🧠', description: 'Parents of children with proprioceptive processing differences', hidden: true },
  { id: 'spd_vestibular',       name: 'Vestibular Differences Parents',              emoji: '🌀', description: 'Parents of children with balance and movement processing differences', hidden: true },
  { id: 'spd_interoception',    name: 'Interoceptive Differences Parents',           emoji: '💓', description: 'Parents of children with internal body sensation differences', hidden: true },
  { id: 'spd_seeking',          name: 'Sensory-Seeking Parents',                     emoji: '🏃', description: 'Parents of sensory-seeking children', hidden: true },
  { id: 'spd_avoidance',        name: 'Sensory-Avoidant Parents',                    emoji: '🛡️', description: 'Parents of sensory-avoidant children', hidden: true },
  { id: 'ld_general',           name: 'Learning Disability Parents Village',         emoji: '📚', description: 'A community for parents of children with learning disabilities' },
  { id: 'dyslexia_parents',     name: 'Dyslexia Parents Village',                    emoji: '📖', description: 'Parents of children with dyslexia supporting each other', hidden: true },
  { id: 'dyscalculia_parents',  name: 'Dyscalculia Parents Village',                 emoji: '🔢', description: 'Parents of children with dyscalculia', hidden: true },
  { id: 'dysgraphia_parents',   name: 'Dysgraphia Parents Village',                  emoji: '✏️', description: 'Parents of children with dysgraphia', hidden: true },
  { id: 'dyspraxia_parents',    name: 'Dyspraxia / DCD Parents Village',             emoji: '🤸', description: 'Parents of children with dyspraxia or developmental coordination disorder', hidden: true },
  { id: 'apd_parents',          name: 'Auditory Processing Disorder Parents',        emoji: '👂', description: 'Parents of children with auditory processing disorder', hidden: true },
  { id: 'nvld_parents',         name: 'NVLD Parents Village',                        emoji: '🧩', description: 'Parents of children with nonverbal learning disability', hidden: true },
  { id: 'ld_other',             name: 'Other Learning Disability Parents',           emoji: '📚', description: 'Parents navigating other learning disabilities', hidden: true },
  { id: 'cerebral_palsy',       name: 'Cerebral Palsy Parents',                      emoji: '💪', description: 'Strength and support for CP families' },
  { id: 'rare_genetic',         name: 'Rare Genetic Condition Parents',              emoji: '🧬', description: 'You are not alone — rare diagnosis families united' },
  { id: 'special_needs_other',  name: 'Special Needs Parents Village',               emoji: '💙', description: 'A welcoming community for all special needs families' },
  // ── Gender identity villages (hidden — found via quiz or search)
  { id: 'nonbinary_child_parents',    name: 'Parents of Non-Binary Children',        emoji: '🌈', description: 'Supporting parents of non-binary kids', hidden: true },
  { id: 'trans_boy_parents',          name: 'Parents of Transgender Boys',           emoji: '💙', description: 'Community for parents of transgender boys (FTM)', hidden: true },
  { id: 'trans_girl_parents',         name: 'Parents of Transgender Girls',          emoji: '💗', description: 'Community for parents of transgender girls (MTF)', hidden: true },
  { id: 'gender_fluid_child_parents', name: 'Parents of Gender Fluid Children',      emoji: '🌊', description: 'Supporting parents of gender fluid kids', hidden: true },
  { id: 'gender_questioning_parents', name: 'Parents of Gender Questioning Children',emoji: '💜', description: 'A safe space while your child explores their identity', hidden: true },
  // ── Single-parent villages
  { id: 'single_mom_choice',       name: 'Single Moms by Choice',                   emoji: '💪', description: 'Women who chose single motherhood — you are not alone' },
  { id: 'single_dad_choice',       name: 'Single Dads by Choice',                   emoji: '💪', description: 'Men who chose single fatherhood — strong and capable' },
  { id: 'single_mom_circumstance', name: 'Single Moms by Circumstance',             emoji: '🌸', description: 'Single mothers navigating parenthood after life changed course' },
  { id: 'single_dad_circumstance', name: 'Single Dads by Circumstance',             emoji: '🌟', description: 'Single fathers navigating parenthood after life changed course' },
  { id: 'single_mom_loss',         name: 'Widowed Moms Village',                    emoji: '🕊️', description: 'Single mothers parenting through grief and loss' },
  { id: 'single_dad_loss',         name: 'Widowed Dads Village',                    emoji: '🕊️', description: 'Single fathers parenting through grief and loss' },
  { id: 'coparenting',             name: 'Co-Parenting Village',                    emoji: '🤝', description: 'Navigating co-parenting together' },
  // ── LGBTQ+ family villages
  { id: 'gay_dads',                name: 'Gay Dads Village',                        emoji: '🏳️‍🌈', description: 'A community for gay fathers' },
  { id: 'lesbian_moms',            name: 'Lesbian Moms Village',                    emoji: '🏳️‍🌈', description: 'A community for lesbian mothers' },
  { id: 'queer_parents',           name: 'Queer & Non-Binary Parents',              emoji: '🏳️‍🌈', description: 'Queer and non-binary parents supporting each other' },
  { id: 'same_sex_parents',        name: 'Same-Sex Parents Village',                emoji: '🏳️‍🌈', description: 'Same-sex couples raising children together' },
  { id: 'trans_parents',           name: 'Transgender Parents Village',             emoji: '🏳️‍⚧️', description: 'Transgender parents supporting one another' },
  // ── Military family villages
  { id: 'military_mom',            name: 'Military Moms Village',                   emoji: '🎖️', description: 'Mothers serving in the armed forces' },
  { id: 'military_dad',            name: 'Military Dads Village',                   emoji: '🎖️', description: 'Fathers serving in the armed forces' },
  { id: 'military_spouse_parent',  name: 'Military Spouse Parents',                 emoji: '🏠', description: 'Parents whose partner serves in the military' },
  { id: 'veteran_parent',          name: 'Veteran Parents Village',                 emoji: '🦅', description: 'Veterans raising children — strength in service and family' },
  { id: 'national_guard_parent',   name: 'National Guard & Reserve Parents',        emoji: '🛡️', description: 'Parents in the National Guard or Reserves' },
  // ── Work situation villages
  { id: 'night_shift_parents',              name: 'Night Shift Parents Village',                emoji: '🌙', description: 'Parents working the overnight shift — solidarity at 3am' },
  { id: 'night_shift_healthcare',           name: 'Night Shift Healthcare Workers',             emoji: '🏥', description: 'Healthcare parents on the overnight grind', hidden: true },
  { id: 'healthcare_worker_parents',        name: 'Healthcare Worker Parents Village',          emoji: '🩺', description: 'Raising kids while saving lives — a community for healthcare parents' },
  { id: 'nurse_parents',                    name: 'Nurse Parents Village',                      emoji: '💉', description: 'Nurses who are also parents — the double shift is real', hidden: true },
  { id: 'doctor_parents',                   name: 'Doctor / Physician Parents Village',         emoji: '🩺', description: 'Physician parents navigating demanding careers and family life', hidden: true },
  { id: 'paramedic_parents',                name: 'Paramedic & First Responder Parents',        emoji: '🚑', description: 'First responder parents — the bravest at work and at home', hidden: true },
  { id: 'mental_health_pro_parents',        name: 'Mental Health Professional Parents',         emoji: '🧠', description: 'Therapists, counselors, and psychologists who are also parents', hidden: true },
  { id: 'therapist_parents',                name: 'PT / OT / SLP Parents Village',              emoji: '🏋️', description: 'Physical, occupational, and speech therapist parents', hidden: true },
  { id: 'teacher_parents',                  name: 'Teacher Parents Village',                    emoji: '🍎', description: 'Educators raising their own little learners' },
  { id: 'early_childhood_educator_parents', name: 'Early Childhood Educator Parents',           emoji: '🧸', description: 'Preschool and early childhood teachers who are also parents', hidden: true },
  { id: 'special_ed_teacher_parents',       name: 'Special Education Teacher Parents',          emoji: '📚', description: 'Special ed teachers — you know this journey from both sides', hidden: true },
  { id: 'wfh_parents',                      name: 'Work From Home Parents Village',             emoji: '💻', description: 'Balancing deadlines and diapers under the same roof' },
  { id: 'entrepreneur_parents',             name: 'Entrepreneur Parents Village',               emoji: '🚀', description: 'Building a business while raising a family' },
  { id: 'small_business_parents',           name: 'Small Business Owner Parents Village',         emoji: '🏪', description: 'Running a local business and raising a family — the hustle is real on both fronts', hidden: true },
  { id: 'part_time_working_parents',        name: 'Part Time Working Parents Village',            emoji: '⏰', description: 'Part time work, full time parent — navigating the balance between both worlds' },
  { id: 'on_leave_parents',                 name: 'On Parental or Medical Leave Parents Village', emoji: '🌿', description: 'On maternity, paternity, medical, or family leave — a season to be present' },
  { id: 'sahp_childcare_cost_parents',      name: 'SAHP — Childcare Too Expensive Village',      emoji: '💸', description: 'When the cost of childcare doesn\'t make going back to work worth it — you\'re not alone', hidden: true },
  { id: 'freelance_parents',                name: 'Freelance & Contractor Parents',             emoji: '🖥️', description: 'Freelancers navigating feast-or-famine with kids in tow', hidden: true },
  { id: 'content_creator_parents',          name: 'Content Creator Parents Village',            emoji: '🎬', description: 'Parents building audiences while raising humans', hidden: true },
  { id: 'sahp',                             name: 'Stay at Home Parents Village',               emoji: '🏠', description: 'SAHM / SAHD — the job that never clocks out' },
  { id: 'sahp_special_needs',               name: 'SAHP — Child\'s Special Needs',             emoji: '💙', description: 'Stay-at-home parents whose child\'s needs require full-time presence', hidden: true },
  { id: 'sahp_returning_to_work',           name: 'SAHP Returning to Work',                    emoji: '💼', description: 'Stay-at-home parents navigating the return-to-work transition', hidden: true },
  { id: 'multiple_jobs_parents',            name: 'Multiple Jobs Parents Village',              emoji: '⏰', description: 'Working more than one job while raising kids — incredibly hard, incredibly real' },
  { id: 'gig_economy_parents',              name: 'Gig Economy Parents Village',                emoji: '🚗', description: 'Rideshare, delivery, and gig workers who are also parents', hidden: true },
  // ── Insurance villages
  { id: 'medicaid_families',        name: 'Medicaid Families Village',                  emoji: '🏥', description: 'Navigating Medicaid and CHIP together' },
  { id: 'chip_families',            name: 'CHIP Families Village',                      emoji: '🏥', description: 'Families with children on CHIP coverage', hidden: true },
  { id: 'medicaid_transitions',     name: 'Medicaid Transition Parents',                emoji: '🔄', description: 'Navigating income changes, renewals, and transitioning off Medicaid', hidden: true },
  { id: 'medicaid_waiver_families', name: 'Medicaid Waiver Families Village',           emoji: '📋', description: 'Families navigating Medicaid waivers for long-term services and supports' },
  { id: 'hcbs_waiver_families',     name: 'HCBS Waiver Families Village',               emoji: '🏠', description: 'Families using Home and Community-Based Services waivers', hidden: true },
  { id: 'katie_beckett_families',   name: 'Katie Beckett / TEFRA Families',             emoji: '💙', description: 'Families navigating the Katie Beckett or TEFRA Medicaid waiver', hidden: true },
  { id: 'dd_waiver_families',       name: 'DD Waiver Families Village',                 emoji: '🧩', description: 'Families navigating Developmental Disabilities Medicaid waivers', hidden: true },
  { id: 'autism_waiver_families',   name: 'Autism Waiver Families Village',             emoji: '🧩', description: 'Families navigating state autism Medicaid waivers', hidden: true },
  { id: 'waiver_waitlist_families', name: 'Waiver Waitlist Parents',                    emoji: '⏳', description: 'Families on the Medicaid waiver waitlist — you are not forgotten', hidden: true },
  { id: 'private_insurance_parents', name: 'Private Insurance Navigation Village',      emoji: '📄', description: 'Navigating employer and marketplace insurance as a parent', hidden: true },
  { id: 'aca_marketplace_parents',  name: 'ACA Marketplace Parents Village',            emoji: '🏛️', description: 'Parents on ACA / Marketplace health plans', hidden: true },
  { id: 'cobra_parents',            name: 'COBRA & Coverage Gap Parents',               emoji: '🔗', description: 'Parents navigating COBRA or gaps in coverage between jobs', hidden: true },
  { id: 'tricare_families',         name: 'TRICARE Families Village',                   emoji: '🎖️', description: 'Military families navigating TRICARE health coverage' },
  { id: 'tricare_echo_families',    name: 'TRICARE ECHO Families Village',              emoji: '🎖️', description: 'Military families using TRICARE Extended Care Health Option for special needs', hidden: true },
  { id: 'uninsured_parents',        name: 'Uninsured Families Village',                 emoji: '🤝', description: 'Finding resources and support without health coverage', hidden: true },
  { id: 'community_health_parents', name: 'Community Health & Free Clinic Parents',     emoji: '🏥', description: 'Families relying on community health centers and free clinics', hidden: true },
  // ── Support network villages
  { id: 'chosen_family_parents',       name: 'Friends Are My Village',                   emoji: '💛', description: 'When your village is made of friends, not family — and that\'s everything' },
  { id: 'long_distance_family_parents', name: 'Long-Distance Family Parents Village',    emoji: '✈️', description: 'Raising kids far from family — navigating love, guilt, and FaceTime calls' },
  { id: 'recently_relocated_parents',  name: 'Recently Relocated Parents Village',       emoji: '📦', description: 'New to the area and building your parenting village from scratch', hidden: true },
  { id: 'estranged_family_parents',    name: 'Estranged From Family Parents Village',    emoji: '💙', description: 'Parenting without family — by circumstance or by choice', hidden: true },
  { id: 'family_doesnt_get_it_parents', name: '"My Family Doesn\'t Get It" Parents',    emoji: '😔', description: 'When your family can\'t understand your child\'s needs or your journey', hidden: true },
  { id: 'rural_parents',               name: 'Rural Parents Village',                    emoji: '🌾', description: 'Parenting in rural and remote areas — long drives, limited resources, tight community', hidden: true },
  { id: 'immigrant_expat_parents',     name: 'Immigrant & Expat Parents Village',        emoji: '🌍', description: 'Raising kids far from your home country — navigating two worlds at once', hidden: true },
  { id: 'virtual_support_parents',     name: 'Online-Only Support Parents Village',      emoji: '💻', description: 'When your primary support system lives in your phone — and that\'s okay', hidden: true },
  // ── Faith & cultural background villages
  { id: 'christian_parents',           name: 'Christian Parents Village',                 emoji: '✝️',  description: 'Raising children in the Christian faith together' },
  { id: 'catholic_parents',            name: 'Catholic Parents Village',                  emoji: '✝️',  description: 'Catholic families navigating parenthood in faith' },
  { id: 'jewish_parents',              name: 'Jewish Parents Village',                    emoji: '✡️',  description: 'Raising Jewish children and navigating Jewish family life' },
  { id: 'muslim_parents',              name: 'Muslim Parents Village',                    emoji: '☪️',  description: 'Muslim families raising children in their faith' },
  { id: 'hindu_parents',               name: 'Hindu Parents Village',                     emoji: '🕉️',  description: 'Hindu families passing down faith and culture to their children' },
  { id: 'buddhist_parents',            name: 'Buddhist Parents Village',                  emoji: '☸️',  description: 'Raising children with Buddhist values and mindfulness' },
  { id: 'sikh_parents',                name: 'Sikh Parents Village',                      emoji: '🪯',  description: 'Sikh families raising children in their faith and culture' },
  { id: 'lds_parents',                 name: 'Latter-day Saint Parents Village',          emoji: '📖', description: 'LDS / Mormon parents navigating faith and family life' },
  { id: 'orthodox_christian_parents',  name: 'Orthodox Christian Parents Village',        emoji: '☦️',  description: 'Eastern and Oriental Orthodox families raising children in the faith' },
  { id: 'pagan_parents',               name: 'Pagan & Earth-Based Spirituality Parents',  emoji: '🌙', description: 'Pagan, Wiccan, and earth-based spirituality families' },
  { id: 'spiritual_nr_parents',        name: 'Spiritual But Not Religious Parents',       emoji: '🌟', description: 'Raising spiritually aware kids outside of organized religion' },
  { id: 'secular_parents',             name: 'Secular & Non-Religious Parents Village',   emoji: '🌍', description: 'Atheist, agnostic, and secular humanist parents' },
  { id: 'interfaith_parents',          name: 'Interfaith Household Parents Village',      emoji: '🕊️', description: 'Navigating two (or more) faiths under one roof' },
  // ── Faith subtypes (hidden — found via quiz or search)
  { id: 'jw_parents',                  name: 'Jehovah\'s Witness Parents Village',        emoji: '📖', description: 'JW families raising children in their faith', hidden: true },
  { id: 'evangelical_parents',         name: 'Evangelical Christian Parents Village',     emoji: '✝️',  description: 'Evangelical parents raising children in the faith', hidden: true },
  { id: 'baptist_parents',             name: 'Baptist Parents Village',                   emoji: '✝️',  description: 'Baptist families navigating parenthood together', hidden: true },
  { id: 'pentecostal_parents',         name: 'Pentecostal & Charismatic Parents',         emoji: '🔥', description: 'Pentecostal and charismatic Christian parents', hidden: true },
  { id: 'nondenominational_parents',   name: 'Non-Denominational Christian Parents',      emoji: '✝️',  description: 'Non-denom church families raising children in faith', hidden: true },
  { id: 'methodist_parents',           name: 'Methodist & Wesleyan Parents Village',      emoji: '✝️',  description: 'Methodist and Wesleyan families raising children together', hidden: true },
  { id: 'lutheran_parents',            name: 'Lutheran Parents Village',                  emoji: '✝️',  description: 'Lutheran families navigating parenthood in faith', hidden: true },
  { id: 'episcopal_parents',           name: 'Episcopal & Anglican Parents Village',      emoji: '✝️',  description: 'Episcopal and Anglican families raising children together', hidden: true },
  { id: 'sda_parents',                 name: 'Seventh-day Adventist Parents Village',     emoji: '✝️',  description: 'SDA families raising children with their faith values', hidden: true },
  { id: 'traditional_catholic_parents', name: 'Traditional Catholic Parents Village',    emoji: '✝️',  description: 'Traditional and Latin Mass Catholic families', hidden: true },
  { id: 'faith_transition_parents',    name: 'Faith Transition Parents Village',          emoji: '🌱', description: 'Parents navigating leaving or changing their faith tradition', hidden: true },
  { id: 'orthodox_jewish_parents',     name: 'Orthodox Jewish Parents Village',           emoji: '✡️',  description: 'Orthodox Jewish families navigating modern parenthood', hidden: true },
  { id: 'reform_jewish_parents',       name: 'Reform Jewish Parents Village',             emoji: '✡️',  description: 'Reform Jewish families raising children in their tradition', hidden: true },
  { id: 'cultural_jewish_parents',     name: 'Cultural & Secular Jewish Parents',         emoji: '✡️',  description: 'Jewish by culture and heritage — raising kids with identity and tradition', hidden: true },
  { id: 'sunni_parents',               name: 'Sunni Muslim Parents Village',              emoji: '☪️',  description: 'Sunni Muslim families raising children in their faith', hidden: true },
  { id: 'shia_parents',                name: 'Shia Muslim Parents Village',               emoji: '☪️',  description: 'Shia Muslim families raising children together', hidden: true },
  { id: 'coptic_parents',              name: 'Coptic Orthodox Parents Village',           emoji: '☦️',  description: 'Coptic Orthodox families navigating parenthood in faith', hidden: true },
  { id: 'ethiopian_orthodox_parents',  name: 'Ethiopian Orthodox Parents Village',        emoji: '☦️',  description: 'Ethiopian Orthodox families raising children in their faith', hidden: true },
  { id: 'lds_faith_transition_parents', name: 'LDS Faith Transition Parents Village',    emoji: '🌱', description: 'Parents navigating a faith transition within or away from the LDS church', hidden: true },
  // ── Language villages
  { id: 'bilingual_multilingual_parents', name: 'Bilingual & Multilingual Families Village', emoji: '🌐', description: 'Intentionally raising children who speak more than one language' },
  { id: 'spanish_speaking_parents',     name: 'Spanish-Speaking Parents Village',         emoji: '🇪🇸', description: 'Criando a nuestros hijos juntos — a community for Spanish-speaking families' },
  { id: 'mandarin_speaking_parents',    name: 'Mandarin-Speaking Parents Village',        emoji: '🇨🇳', description: 'Raising children in Mandarin-speaking households', hidden: true },
  { id: 'cantonese_speaking_parents',   name: 'Cantonese-Speaking Parents Village',       emoji: '🇭🇰', description: 'Raising children in Cantonese-speaking households', hidden: true },
  { id: 'arabic_speaking_parents',      name: 'Arabic-Speaking Parents Village',          emoji: '🌙', description: 'Raising children in Arabic-speaking households', hidden: true },
  { id: 'hindi_speaking_parents',       name: 'Hindi-Speaking Parents Village',           emoji: '🇮🇳', description: 'Raising children in Hindi-speaking households', hidden: true },
  { id: 'french_speaking_parents',      name: 'French-Speaking Parents Village',          emoji: '🇫🇷', description: 'Raising children in French-speaking households', hidden: true },
  { id: 'portuguese_speaking_parents',  name: 'Portuguese-Speaking Parents Village',      emoji: '🇧🇷', description: 'Raising children in Portuguese-speaking households', hidden: true },
  { id: 'tagalog_speaking_parents',     name: 'Filipino / Tagalog-Speaking Parents',      emoji: '🇵🇭', description: 'Raising children in Tagalog and Filipino-speaking households', hidden: true },
  { id: 'vietnamese_speaking_parents',  name: 'Vietnamese-Speaking Parents Village',      emoji: '🇻🇳', description: 'Raising children in Vietnamese-speaking households', hidden: true },
  { id: 'korean_speaking_parents',      name: 'Korean-Speaking Parents Village',          emoji: '🇰🇷', description: 'Raising children in Korean-speaking households', hidden: true },
  { id: 'japanese_speaking_parents',    name: 'Japanese-Speaking Parents Village',        emoji: '🇯🇵', description: 'Raising children in Japanese-speaking households', hidden: true },
  { id: 'russian_speaking_parents',     name: 'Russian-Speaking Parents Village',         emoji: '🇷🇺', description: 'Raising children in Russian-speaking households', hidden: true },
  { id: 'asl_parents',                  name: 'ASL / Deaf Community Parents Village',     emoji: '🤟', description: 'Deaf, hard of hearing, and signing families raising children in ASL', hidden: true },
  // ── Spanish dialect villages (hidden)
  { id: 'mexican_american_parents',     name: 'Mexican & Mexican-American Parents',       emoji: '🇲🇽', description: 'Mexican and Mexican-American families raising the next generation', hidden: true },
  { id: 'puerto_rican_parents',         name: 'Puerto Rican Parents Village',             emoji: '🇵🇷', description: 'Boricua families — raising children between two worlds', hidden: true },
  { id: 'cuban_parents',               name: 'Cuban Parents Village',                    emoji: '🇨🇺', description: 'Cuban families raising children and preserving culture', hidden: true },
  { id: 'dominican_parents',            name: 'Dominican Parents Village',                emoji: '🇩🇴', description: 'Dominican families raising children with pride and culture', hidden: true },
  { id: 'central_american_parents',     name: 'Central American Parents Village',         emoji: '🌎', description: 'Guatemalan, Salvadoran, Honduran, and other Central American families', hidden: true },
  // ── Arabic dialect villages (hidden)
  { id: 'arabic_levantine_parents',     name: 'Levantine Arab Parents Village',           emoji: '🌙', description: 'Syrian, Lebanese, Palestinian, and Jordanian families', hidden: true },
  { id: 'arabic_egyptian_parents',      name: 'Egyptian Parents Village',                 emoji: '🇪🇬', description: 'Egyptian families raising children and passing on culture', hidden: true },
  { id: 'arabic_gulf_parents',          name: 'Gulf Arab Parents Village',                emoji: '🌙', description: 'Saudi, Emirati, Kuwaiti, Qatari, and Gulf families', hidden: true },
  { id: 'arabic_maghrebi_parents',      name: 'Maghrebi / North African Parents',         emoji: '🇲🇦', description: 'Moroccan, Algerian, Tunisian, and Libyan families', hidden: true },
  // ── Portuguese dialect village (hidden)
  { id: 'brazilian_portuguese_parents', name: 'Brazilian Parents Village',                emoji: '🇧🇷', description: 'Brazilian families raising children and passing on culture', hidden: true },
  // ── Housing situation villages
  { id: 'apartment_parents',           name: 'Raising Kids in an Apartment Village',    emoji: '🏢', description: 'No backyard, neighbors below, limited space — apartment parenting is its own adventure' },
  { id: 'multigenerational_parents',   name: 'Multigenerational Household Village',      emoji: '🏠', description: 'Three or more generations under one roof — a unique and beautifully complicated life' },
  { id: 'tiny_home_parents',           name: 'Tiny Home & Alternative Housing Families', emoji: '🏡', description: 'Van life, tiny homes, skoolies — raising kids intentionally in small spaces' },
  { id: 'housing_instability_parents', name: 'Housing Instability Families Village',     emoji: '🤝', description: 'Navigating housing challenges while raising children — you deserve community and support' },
  { id: 'homeowner_parents',           name: 'New Homeowner Parents Village',            emoji: '🔑', description: 'Figuring out homeownership and parenthood at the same time — welcome to the club', hidden: true },
  { id: 'suburban_parents',            name: 'Suburban Parents Village',                 emoji: '🏘️', description: 'Raising kids in the suburbs — school districts, cul-de-sacs, and minivans', hidden: true },
  { id: 'urban_parents',               name: 'Urban / City Parents Village',             emoji: '🌆', description: 'City parents raising kids — playgrounds, public transit, and tight square footage', hidden: true },
  { id: 'condo_townhouse_parents',     name: 'Condo & Townhouse Parents Village',        emoji: '🏙️', description: 'HOAs, shared walls, and no yard — navigating condo and townhouse life with kids', hidden: true },
  { id: 'renting_parents',             name: 'Renting Parents Village',                  emoji: '🏠', description: 'Raising kids in a rental — leases, landlords, and making it home anyway', hidden: true },
  { id: 'inlaws_parents',              name: 'Living With In-Laws Parents Village',      emoji: '👨‍👩‍👧', description: 'Navigating the joys and challenges of living with your partner\'s family', hidden: true },
  { id: 'van_life_parents',            name: 'Van Life Families Village',                emoji: '🚐', description: 'Raising kids on the road in a van — freedom, adventure, and creative family life', hidden: true },
  { id: 'rv_parents',                  name: 'Full-Time RV Families Village',            emoji: '🚌', description: 'Full-time RV families raising children wherever the road takes them', hidden: true },
  { id: 'farm_parents',                name: 'Farm & Agricultural Families Village',     emoji: '🌾', description: 'Raising kids on a farm — the chores, the animals, the early mornings', hidden: true },
  { id: 'new_construction_parents',    name: 'New Construction Home Parents',            emoji: '🔨', description: 'Navigating a new build — delays, walkthroughs, and raising kids through it all', hidden: true },
  // ── Work situation (additional subtypes)
  { id: 'pharmacist_parents',              name: 'Pharmacist Parents Village',                   emoji: '💊', description: 'Pharmacists who are also parents — dispensing knowledge at home and at work', hidden: true },
  { id: 'medical_admin_parents',           name: 'Medical Admin & Support Staff Parents',        emoji: '🏥', description: 'The backbone of healthcare — medical admin and support staff parents', hidden: true },
  { id: 'elementary_teacher_parents',      name: 'Elementary School Teacher Parents',            emoji: '🍎', description: 'Teaching K–5 and raising your own — double duty educators', hidden: true },
  { id: 'middle_school_teacher_parents',   name: 'Middle School Teacher Parents Village',        emoji: '📚', description: 'Middle school teachers raising kids — brave on both fronts', hidden: true },
  { id: 'high_school_teacher_parents',     name: 'High School Teacher Parents Village',          emoji: '🎓', description: 'High school educators raising their own teens or little ones', hidden: true },
  { id: 'college_educator_parents',        name: 'College & University Educator Parents',        emoji: '🎓', description: 'Professors, lecturers, and college educators navigating academia and parenthood', hidden: true },
  { id: 'paraprofessional_parents',        name: 'Instructional Aide & Paraprofessional Parents', emoji: '🤝', description: 'Paraprofessionals and instructional aides who are also parents', hidden: true },
  { id: 'remote_employee_parents',         name: 'Remote Employee Parents Village',              emoji: '💻', description: 'Working a company job from home — balancing Zoom calls and toddlers', hidden: true },
  { id: 'home_daycare_parents',            name: 'Home Daycare Provider Parents Village',        emoji: '🏠', description: 'Running a home daycare while raising your own — the ultimate multi-task', hidden: true },
  { id: 'sahp_by_choice',                  name: 'SAHP by Choice Village',                       emoji: '🌸', description: 'Stay-at-home parents who chose this path — loving every (chaotic) moment', hidden: true },
  { id: 'night_shift_hospitality',         name: 'Night Shift Hospitality & Service Parents',    emoji: '🌙', description: 'Restaurant, hotel, and hospitality workers on the overnight shift raising kids', hidden: true },
  { id: 'law_enforcement_parents',         name: 'Law Enforcement & Security Parents Village',   emoji: '🚔', description: 'Law enforcement officers and security professionals who are also parents', hidden: true },
  { id: 'night_shift_transport',           name: 'Night Shift Transport & Logistics Parents',    emoji: '🚛', description: 'Truck drivers, delivery, and logistics workers on overnight shifts raising kids', hidden: true },
  { id: 'night_shift_factory',             name: 'Night Shift Factory & Warehouse Parents',      emoji: '🏭', description: 'Factory and warehouse workers on the overnight grind who are also parents', hidden: true },
  // ── Insurance (additional subtypes)
  { id: 'tech_assisted_waiver_families',   name: 'Technology-Assisted Waiver Families',          emoji: '🩺', description: 'Families navigating vent, trach, and technology-assisted Medicaid waivers', hidden: true },
  // ── Support network (additional subtypes)
  { id: 'strong_support_parents',          name: 'Strong Support Network Parents',               emoji: '🌟', description: 'Parents with a solid local village — sharing what works and paying it forward', hidden: true },
  { id: 'schedule_conflict_parents',       name: '"Everyone\'s Too Busy" Parents Village',       emoji: '📅', description: 'Your support is there — but schedules never align. You are not alone.', hidden: true },
  { id: 'ppd_isolation_parents',           name: 'Postpartum Depression & Isolation Village',    emoji: '💛', description: 'Navigating PPD or mental health challenges while feeling isolated — a safe, gentle space', hidden: true },
  { id: 'partner_travels_parents',         name: 'Partner Works Away Parents Village',           emoji: '✈️', description: 'Parenting solo when your partner travels frequently for work', hidden: true },
  { id: 'grief_transition_parents',        name: 'Grief & Major Life Transition Parents',        emoji: '🕊️', description: 'Parents navigating grief, loss, or a major life change while raising children', hidden: true },
  // ── Religion (additional subtypes)
  { id: 'reformed_parents',               name: 'Reformed & Presbyterian Parents Village',      emoji: '✝️',  description: 'Reformed, Presbyterian, and Calvinist parents raising children in the faith', hidden: true },
  { id: 'cultural_catholic_parents',      name: 'Cultural Catholic Parents Village',            emoji: '✝️',  description: 'Catholic by culture and heritage — navigating faith, family, and identity', hidden: true },
  { id: 'questioning_catholic_parents',   name: 'Questioning Catholic Parents Village',         emoji: '✝️',  description: 'Navigating disagreements with the Church while raising a family', hidden: true },
  { id: 'conservative_jewish_parents',    name: 'Conservative / Masorti Jewish Parents',       emoji: '✡️',  description: 'Conservative and Masorti Jewish families navigating modern parenthood', hidden: true },
  { id: 'reconstructionist_jewish_parents', name: 'Reconstructionist & Renewal Jewish Parents', emoji: '✡️', description: 'Reconstructionist and Jewish Renewal families raising children with evolving traditions', hidden: true },
  { id: 'sufi_parents',                   name: 'Sufi Parents Village',                         emoji: '☪️',  description: 'Sufi Muslim families raising children with spiritual depth and tradition', hidden: true },
  { id: 'ahmadiyya_parents',              name: 'Ahmadiyya Parents Village',                    emoji: '☪️',  description: 'Ahmadiyya Muslim families navigating parenthood in faith', hidden: true },
  { id: 'cultural_muslim_parents',        name: 'Cultural & Non-Practicing Muslim Parents',     emoji: '☪️',  description: 'Muslim by culture and identity — raising children with heritage and connection', hidden: true },
  { id: 'greek_orthodox_parents',         name: 'Greek Orthodox Parents Village',               emoji: '☦️',  description: 'Greek Orthodox families raising children in their faith and culture', hidden: true },
  { id: 'russian_orthodox_parents',       name: 'Russian Orthodox Parents Village',             emoji: '☦️',  description: 'Russian Orthodox families raising children in their faith', hidden: true },
  { id: 'antiochian_orthodox_parents',    name: 'Antiochian Orthodox Parents Village',          emoji: '☦️',  description: 'Antiochian Orthodox families navigating parenthood in faith', hidden: true },
  { id: 'slavic_orthodox_parents',        name: 'Serbian / Bulgarian / Romanian Orthodox Parents', emoji: '☦️', description: 'Serbian, Bulgarian, Romanian, and Slavic Orthodox families raising children together', hidden: true },
  { id: 'cultural_lds_parents',           name: 'Cultural / Less Active LDS Parents Village',  emoji: '📖', description: 'LDS by background — navigating faith, family, and your own path', hidden: true },
  // ── Language (additional villages)
  { id: 'italian_speaking_parents',       name: 'Italian-Speaking Parents Village',             emoji: '🇮🇹', description: 'Raising children in Italian-speaking households', hidden: true },
  { id: 'german_speaking_parents',        name: 'German-Speaking Parents Village',              emoji: '🇩🇪', description: 'Raising children in German-speaking households', hidden: true },
  { id: 'haitian_creole_parents',         name: 'Haitian Creole–Speaking Parents Village',     emoji: '🇭🇹', description: 'Haitian and Haitian-American families raising children in Haitian Creole', hidden: true },
  { id: 'punjabi_speaking_parents',       name: 'Punjabi-Speaking Parents Village',             emoji: '🌾', description: 'Raising children in Punjabi-speaking households', hidden: true },
  { id: 'urdu_speaking_parents',          name: 'Urdu-Speaking Parents Village',                emoji: '🌙', description: 'Raising children in Urdu-speaking households', hidden: true },
  { id: 'bengali_speaking_parents',       name: 'Bengali-Speaking Parents Village',             emoji: '🌺', description: 'Raising children in Bengali-speaking households', hidden: true },
  { id: 'tamil_speaking_parents',         name: 'Tamil-Speaking Parents Village',               emoji: '🌺', description: 'Raising children in Tamil-speaking households', hidden: true },
  { id: 'farsi_speaking_parents',         name: 'Farsi / Persian–Speaking Parents Village',    emoji: '🌙', description: 'Raising children in Farsi and Persian-speaking households', hidden: true },
  { id: 'polish_speaking_parents',        name: 'Polish-Speaking Parents Village',              emoji: '🦅', description: 'Raising children in Polish-speaking households', hidden: true },
  { id: 'ukrainian_speaking_parents',     name: 'Ukrainian-Speaking Parents Village',           emoji: '🌻', description: 'Raising children in Ukrainian-speaking households', hidden: true },
  { id: 'swahili_speaking_parents',       name: 'Swahili-Speaking Parents Village',             emoji: '🌍', description: 'Raising children in Swahili-speaking households', hidden: true },
  { id: 'yoruba_speaking_parents',        name: 'Yoruba-Speaking Parents Village',              emoji: '🌍', description: 'Raising children in Yoruba-speaking households', hidden: true },
  { id: 'amharic_speaking_parents',       name: 'Amharic-Speaking Parents Village',             emoji: '🇪🇹', description: 'Raising children in Amharic-speaking households', hidden: true },
  // ── Spanish dialect villages (additional)
  { id: 'south_american_parents',         name: 'Colombian / Venezuelan / South American Parents', emoji: '🌎', description: 'Colombian, Venezuelan, and South American families raising children and preserving culture', hidden: true },
  { id: 'spain_spanish_parents',          name: 'Parents from Spain (Castilian Spanish)',       emoji: '🇪🇸', description: 'Families from Spain raising children in Castilian Spanish tradition', hidden: true },
  // ── Arabic dialect villages (additional)
  { id: 'iraqi_parents',                  name: 'Iraqi Parents Village',                         emoji: '🌙', description: 'Iraqi families raising children and passing on culture', hidden: true },
  { id: 'sudanese_parents',               name: 'Sudanese & East African Arabic–Speaking Parents', emoji: '🌍', description: 'Sudanese and East African Arabic-speaking families raising children together', hidden: true },
  // ── Portuguese dialect villages (additional)
  { id: 'european_portuguese_parents',    name: 'Portuguese (Portugal) Parents Village',         emoji: '🇵🇹', description: 'Families from Portugal raising children in their language and culture', hidden: true },
  { id: 'african_portuguese_parents',     name: 'African Portuguese–Speaking Parents Village',   emoji: '🌍', description: 'Cape Verdean, Mozambican, Angolan, and other African Portuguese-speaking families', hidden: true },
  // ── Housing (additional subtypes)
  { id: 'saving_to_buy_parents',          name: 'Saving to Buy Parents Village',                 emoji: '🏠', description: 'Renting now, saving for later — the hustle of working toward homeownership with kids', hidden: true },
  { id: 'house_rental_parents',           name: 'House & Townhouse Rental Parents Village',      emoji: '🏡', description: 'Renting a house or townhouse — more space, same landlord', hidden: true },
  { id: 'living_with_own_family_parents', name: 'Living With My Own Family Parents Village',     emoji: '🏠', description: 'Living with your own parents or family — navigating boundaries, help, and love under one roof', hidden: true },
  { id: 'three_gen_household_parents',    name: 'Three-Generation Household Parents Village',    emoji: '🏠', description: 'Grandparents, parents, and children all under one roof — rich, complicated, and full of love', hidden: true },
  { id: 'adu_parents',                    name: 'ADU & In-Law Suite Families Village',           emoji: '🏡', description: 'Family in the attached unit or backyard ADU — close but with a door', hidden: true },
  { id: 'skoolie_parents',                name: 'Skoolie Parents Village',                       emoji: '🚌', description: 'Converted school bus families raising kids on the road — the coolest classroom ever', hidden: true },
  { id: 'off_grid_parents',               name: 'Off-Grid & Earthship / Yurt Families',         emoji: '🌿', description: 'Off-grid, earthship, and yurt families raising children intentionally off the beaten path', hidden: true },
  { id: 'eviction_risk_parents',          name: 'Eviction Risk Parents Village',                 emoji: '🤝', description: 'Facing eviction while raising children — a judgment-free space for resources and community', hidden: true },
  { id: 'foreclosure_parents',            name: 'Facing Foreclosure Parents Village',            emoji: '🏠', description: 'Navigating foreclosure with kids at home — you deserve support, not shame', hidden: true },
  { id: 'couch_surfing_parents',          name: 'Temporarily Staying with Others — Parents',    emoji: '🤝', description: 'Couch surfing or staying with others temporarily while raising children', hidden: true },
  { id: 'shelter_parents',                name: 'In Shelter / Transitional Housing Parents',    emoji: '🏠', description: 'Parents in shelters or transitional housing — you are doing what it takes for your family', hidden: true },
  { id: 'housing_assistance_parents',     name: 'Housing Assistance Navigation Parents',         emoji: '📋', description: 'Navigating Section 8, housing vouchers, and housing assistance programs as a parent', hidden: true },
  // ── TTC (Trying to Conceive) villages
  { id: 'ttc_village',               name: 'Trying to Conceive (TTC) Village',         emoji: '🌸', description: 'The TTC journey — hope, patience, and community for those working toward parenthood' },
  { id: 'ttc_after_loss',            name: 'TTC After Pregnancy Loss Village',          emoji: '💜', description: 'Trying again after a loss — holding grief and hope at the same time', hidden: true },
  { id: 'ttc_infertility',           name: 'Infertility Journey Village',               emoji: '🌿', description: 'Navigating an infertility diagnosis — the appointments, the emotions, the resilience', hidden: true },
  { id: 'ttc_pcos',                  name: 'PCOS & TTC Village',                        emoji: '🌸', description: 'Trying to conceive with PCOS — tracking cycles, managing symptoms, and staying hopeful', hidden: true },
  { id: 'ttc_unexplained',           name: 'Unexplained Infertility Village',           emoji: '🔍', description: 'When the tests don\'t give answers — navigating unexplained infertility together', hidden: true },
  { id: 'ttc_long_journey',          name: 'Long TTC Journey Village (1+ Year)',        emoji: '⏳', description: 'Still on the journey after a year or more — your persistence is extraordinary', hidden: true },
  { id: 'ttc_secondary_infertility', name: 'Secondary Infertility Village',            emoji: '💙', description: 'Trying to conceive again when it\'s not happening as expected — you are not alone', hidden: true },
  { id: 'ttc_treatments',            name: 'Fertility Treatment Journey Village',       emoji: '🔬', description: 'In the thick of IVF, IUI, or other treatments — the injections, the waits, the hope', hidden: true },
  { id: 'ttc_lgbtq_family_building', name: 'LGBTQ+ Family Building Village',           emoji: '🌈', description: 'Building your family as an LGBTQ+ person or couple — navigating the unique path to parenthood', hidden: true },
  // ── IEP / 504 villages
  { id: '504_plan_parents',             name: '504 Plan Parents Village',                    emoji: '📋', description: 'Navigating 504 accommodations — advocating for your child\'s access and success at school' },
  { id: 'iep_process_parents',          name: 'IEP Evaluation Process Parents Village',      emoji: '🔍', description: 'In the thick of getting an IEP — evaluations, eligibility, and advocating hard for your child' },
  { id: 'early_intervention_parents',   name: 'Early Intervention Parents Village',           emoji: '🌱', description: 'Part C / Early Intervention families — therapies, IFSP, and navigating services under age 3' },
  { id: 'iep_denial_parents',           name: 'Fighting for an IEP — Parents Village',       emoji: '💪', description: 'Your child was denied — and you\'re not giving up. A space for parents fighting for services', hidden: true },
  { id: 'iep_speech_parents',           name: 'IEP: Speech & Language Services Parents',     emoji: '💬', description: 'Parents whose child\'s IEP includes speech-language therapy services', hidden: true },
  { id: 'iep_ot_parents',               name: 'IEP: Occupational Therapy Parents',           emoji: '✋', description: 'Parents whose child\'s IEP includes occupational therapy services', hidden: true },
  { id: 'iep_pt_parents',               name: 'IEP: Physical Therapy Parents',               emoji: '🦵', description: 'Parents whose child\'s IEP includes physical therapy services', hidden: true },
  { id: 'iep_behavioral_parents',       name: 'IEP: Behavioral Support & BIP Parents',       emoji: '🧠', description: 'Families navigating IEP behavioral goals and Behavior Intervention Plans', hidden: true },
  { id: 'iep_autism_services_parents',  name: 'Autism IEP Services Parents Village',         emoji: '🧩', description: 'Parents navigating an IEP specifically written around their child\'s autism needs', hidden: true },
  { id: '504_adhd_parents',             name: '504 for ADHD Parents Village',                emoji: '⚡', description: 'Families with a 504 plan for ADHD — extra time, movement breaks, and advocating for access', hidden: true },
  { id: '504_anxiety_parents',          name: '504 for Anxiety & Mental Health Parents',     emoji: '💛', description: 'Parents navigating a 504 plan for anxiety or mental health needs at school', hidden: true },
  { id: '504_medical_parents',          name: '504 for Medical Needs Parents Village',        emoji: '🏥', description: 'Families with a 504 for medical conditions — diabetes, seizures, allergies, and more', hidden: true },
  { id: 'gen_ed_parents',               name: 'General Education Parents Village',            emoji: '📚', description: 'Parents navigating general education — no IEP or 504, just figuring out school together', hidden: true },
  // ── School & childcare villages
  { id: 'public_school_parents',          name: 'Public School Parents Village',               emoji: '🏫', description: 'Navigating the public school system — a community for public school families' },
  { id: 'private_school_parents',         name: 'Private School Parents Village',              emoji: '🎒', description: 'Private school families — tuition, community, and all the decisions that come with it' },
  { id: 'homeschool_parents',             name: 'Homeschool Parents Village',                  emoji: '📚', description: 'Homeschooling families supporting each other — curriculum, co-ops, and learning at home' },
  { id: 'daycare_parents',               name: 'Daycare & Childcare Parents Village',          emoji: '🧸', description: 'Navigating daycare, drop-offs, and finding the right childcare for your child' },
  { id: 'preschool_parents',             name: 'Preschool & Pre-K Parents Village',            emoji: '🎨', description: 'The preschool years — navigating programs, readiness, and those first school moments' },
  { id: 'charter_school_parents',        name: 'Charter School Parents Village',               emoji: '🏫', description: 'Charter school families — lotteries, programs, and navigating an alternative path', hidden: true },
  { id: 'magnet_school_parents',         name: 'Magnet School Parents Village',                emoji: '🧲', description: 'Magnet school families — specialized programs and the application process', hidden: true },
  { id: 'title_one_school_parents',      name: 'Title I School Families Village',              emoji: '🏫', description: 'Families at Title I schools — advocating for resources and navigating high-need environments', hidden: true },
  { id: 'virtual_school_parents',        name: 'Virtual & Online School Parents Village',      emoji: '💻', description: 'Families doing school fully online — schedules, screens, and making it work at home', hidden: true },
  { id: 'faith_based_school_parents',    name: 'Faith-Based School Parents Village',           emoji: '✝️',  description: 'Religious and faith-based school families — education rooted in faith', hidden: true },
  { id: 'montessori_parents',            name: 'Montessori Parents Village',                   emoji: '🌱', description: 'Montessori families — child-led learning, mixed ages, and the Montessori philosophy', hidden: true },
  { id: 'waldorf_parents',              name: 'Waldorf School Parents Village',                emoji: '🎭', description: 'Waldorf families — seasonal rhythms, imaginative learning, and holistic education', hidden: true },
  { id: 'private_sped_school_parents',  name: 'Private Special Education School Parents',     emoji: '📋', description: 'Families who chose a private special education school — navigating placement, cost, and advocacy', hidden: true },
  { id: 'classical_homeschool_parents', name: 'Classical Homeschool Parents Village',          emoji: '📜', description: 'Classical homeschooling families — trivium, great books, and rigorous academics at home', hidden: true },
  { id: 'charlotte_mason_parents',      name: 'Charlotte Mason Homeschool Parents',           emoji: '🌿', description: 'Charlotte Mason families — living books, nature study, and narration at home', hidden: true },
  { id: 'unschooling_parents',          name: 'Unschooling & Child-Led Learning Parents',     emoji: '🌍', description: 'Unschooling families — trust, curiosity, and learning on your child\'s terms', hidden: true },
  { id: 'homeschool_coop_parents',      name: 'Homeschool Co-op Parents Village',             emoji: '🤝', description: 'Co-op homeschooling families — community, shared classes, and learning together', hidden: true },
  { id: 'homeschool_special_needs_parents', name: 'Homeschooling for Special Needs Parents',  emoji: '💙', description: 'Parents who chose to homeschool because of their child\'s special needs or medical needs', hidden: true },
  { id: 'head_start_parents',           name: 'Head Start Parents Village',                   emoji: '⭐', description: 'Head Start and Early Head Start families — early learning, family support, and community', hidden: true },
  { id: 'family_daycare_parents',       name: 'Home Daycare & Family Childcare Parents',      emoji: '🏠', description: 'Families using a home daycare or family childcare provider — the cozy alternative to centers', hidden: true },
  { id: 'faith_based_childcare_parents', name: 'Faith-Based Childcare Parents Village',       emoji: '🙏', description: 'Families using faith-based daycare or preschool programs', hidden: true },
  { id: 'military_cdc_parents',         name: 'Military CDC Parents Village',                 emoji: '🎖️', description: 'Military families using on-base Child Development Centers', hidden: true },
  { id: 'nanny_aupair_parents',         name: 'Nanny & Au Pair Families Village',             emoji: '🏠', description: 'Families with a nanny, au pair, or in-home caregiver — navigating a unique childcare arrangement', hidden: true },
  { id: 'home_with_parent_parents',     name: 'Home with Parent — Not in School Yet',         emoji: '🏡', description: 'Children not yet in school or childcare — parents who are home with little ones full-time', hidden: true },
  // ── Medical equipment villages
  { id: 'wheelchair_parents',          name: 'Wheelchair User Parents Village',              emoji: '♿', description: 'Raising a child who uses a wheelchair — adaptive living, advocacy, and community' },
  { id: 'manual_wheelchair_parents',   name: 'Manual Wheelchair Parents Village',            emoji: '♿', description: 'Families navigating manual wheelchairs — ramps, terrain, and daily life', hidden: true },
  { id: 'power_chair_parents',         name: 'Power Chair Parents Village',                  emoji: '⚡', description: 'Power wheelchair families — tech, access, and independence for your child', hidden: true },
  { id: 'gait_trainer_parents',        name: 'Gait Trainer & Walker Parents Village',        emoji: '🚶', description: 'Parents of children using gait trainers, walkers, and adaptive mobility devices', hidden: true },
  { id: 'hearing_loss_parents',        name: 'Hearing Loss Parents Village',                 emoji: '👂', description: 'Raising a child with hearing loss — audiologists, accommodations, and community' },
  { id: 'hearing_aids_parents',        name: 'Hearing Aids Parents Village',                 emoji: '👂', description: 'Families navigating hearing aids — fittings, upkeep, and raising your child with confidence', hidden: true },
  { id: 'cochlear_implant_parents',    name: 'Cochlear Implant Parents Village',             emoji: '🔊', description: 'Parents navigating cochlear implants — surgery, mapping, and the journey toward sound', hidden: true },
  { id: 'baha_parents',                name: 'BAHA & Bone Anchored Hearing Aid Parents',    emoji: '🔊', description: 'Families using bone anchored hearing aids (BAHA / Osia)', hidden: true },
  { id: 'deaf_child_parents',          name: 'Deaf Child Parents Village',                   emoji: '🤟', description: 'Raising a Deaf child — navigating identity, language, education, and community', hidden: true },
  { id: 'hard_of_hearing_parents',     name: 'Hard of Hearing Child Parents Village',        emoji: '👂', description: 'Parenting a hard of hearing child — between two worlds and advocating every step', hidden: true },
  { id: 'oxygen_dependent_parents',    name: 'Oxygen-Dependent Child Parents Village',       emoji: '🫁', description: 'Raising a child on supplemental oxygen — monitors, tanks, and loving every breath', hidden: true },
  { id: 'vent_dependent_parents',      name: 'Ventilator-Dependent Child Parents Village',   emoji: '🫁', description: 'Families navigating life with a child on a ventilator — the most dedicated caregivers', hidden: true },
  { id: 'trach_parents',               name: 'Trach Parents Village',                        emoji: '🩺', description: 'Parents of children with a tracheostomy — trach care, suctioning, and the love that powers it all', hidden: true },
  { id: 'aac_parents',                 name: 'AAC User Parents Village',                     emoji: '💬', description: 'Raising a child who communicates with AAC — a device, a voice, a world opened up' },
  { id: 'orthotics_parents',           name: 'Orthotics & AFO Parents Village',              emoji: '🦿', description: 'Families navigating orthotics, AFOs, leg braces, and prosthetics', hidden: true },
  { id: 'cpap_bipap_parents',          name: 'CPAP / BiPAP Parents Village',                 emoji: '😴', description: 'Parents of children using CPAP or BiPAP — nights, masks, and sleep support', hidden: true },
  { id: 'cgm_pump_parents',            name: 'CGM & Insulin Pump Parents Village',           emoji: '💉', description: 'Parents managing a child\'s diabetes with a CGM or insulin pump', hidden: true },
  // ── Surgery villages
  { id: 'pediatric_surgery_parents',      name: 'Pediatric Surgery Parents Village',             emoji: '🏥', description: 'Parents navigating pediatric surgery — before, during, and after the OR' },
  { id: 'upcoming_surgery_parents',       name: 'Pre-Surgery Parents Village',                   emoji: '⏳', description: 'Preparing for your child\'s upcoming surgery — the anxiety, the questions, the waiting', hidden: true },
  { id: 'open_heart_surgery_parents',     name: 'Open Heart Surgery Parents Village',            emoji: '❤️', description: 'Parents of children who have had open heart surgery — the journey, recovery, and life after', hidden: true },
  { id: 'pediatric_neurosurgery_parents', name: 'Pediatric Neurosurgery Parents Village',        emoji: '🧠', description: 'Parents navigating brain and spinal surgeries for their children', hidden: true },
  { id: 'organ_transplant_parents',       name: 'Pediatric Organ Transplant Parents Village',    emoji: '💚', description: 'Families navigating a child\'s organ transplant — the wait, the surgery, and life after', hidden: true },
  // ── Pediatric cancer villages
  { id: 'pediatric_cancer_parents',       name: 'Pediatric Cancer Parents Village',              emoji: '💛', description: 'Parents navigating a child\'s cancer diagnosis — treatment, advocacy, and community' },
  { id: 'childhood_leukemia_parents',     name: 'Childhood Leukemia Parents Village',            emoji: '💛', description: 'ALL, AML, and leukemia families — the treatment journey and life after', hidden: true },
  { id: 'brain_tumor_parents',            name: 'Pediatric Brain Tumor Parents Village',         emoji: '🧠', description: 'Navigating a child\'s brain tumor diagnosis, surgery, and treatment', hidden: true },
  { id: 'neuroblastoma_parents',          name: 'Neuroblastoma Parents Village',                 emoji: '💛', description: 'Neuroblastoma families — diagnosis, treatment, and hope', hidden: true },
  { id: 'childhood_cancer_survivors',     name: 'Childhood Cancer Survivor Parents Village',     emoji: '🌟', description: 'Life after treatment — parents of childhood cancer survivors', hidden: true },
  // ── Kidney / urological condition villages
  { id: 'kidney_condition_parents',       name: 'Pediatric Kidney Condition Parents Village',    emoji: '🫘', description: 'Parents navigating a child\'s kidney or urological condition', hidden: true },
  { id: 'pkd_parents',                    name: 'Polycystic Kidney Disease (PKD) Parents',       emoji: '🫘', description: 'Families navigating polycystic kidney disease in children', hidden: true },
  { id: 'nephrotic_syndrome_parents',     name: 'Nephrotic Syndrome Parents Village',            emoji: '🫘', description: 'Parents navigating childhood nephrotic syndrome', hidden: true },
  // ── Surgical condition villages
  { id: 'craniosynostosis_parents',       name: 'Craniosynostosis Parents Village',              emoji: '🧠', description: 'Navigating craniosynostosis — diagnosis, skull surgery, and recovery', hidden: true },
  { id: 'esophageal_atresia_parents',     name: 'Esophageal Atresia & TEF Parents Village',     emoji: '🏥', description: 'EA/TEF families — the surgeries, the feeding challenges, and the community', hidden: true },
  { id: 'hirschsprung_parents',           name: "Hirschsprung's Disease Parents Village",        emoji: '🏥', description: "Hirschsprung's families — surgery, recovery, and bowel management", hidden: true },
  { id: 'biliary_atresia_parents',        name: 'Biliary Atresia Parents Village',               emoji: '🏥', description: 'Biliary atresia families — Kasai procedures, liver transplants, and life after', hidden: true },
  { id: 'short_bowel_parents',            name: 'Short Bowel Syndrome Parents Village',          emoji: '🏥', description: 'Short bowel syndrome and intestinal failure families — the TPN journey and beyond', hidden: true },
  { id: 'scoliosis_parents',              name: 'Pediatric Scoliosis Parents Village',           emoji: '🦴', description: 'Parents navigating childhood scoliosis — bracing, surgery, and monitoring', hidden: true },
  { id: 'hip_dysplasia_parents',          name: 'Hip Dysplasia & DDH Parents Village',           emoji: '🦴', description: 'DDH families — Pavlik harnesses, surgery, and recovery', hidden: true },
  // ── ADHD (pending diagnosis)
  { id: 'adhd_pending_diagnosis',         name: 'ADHD Awaiting Diagnosis Parents Village',       emoji: '⚡', description: 'Waiting for an ADHD diagnosis — navigating the process while raising your child', hidden: true },
  // ── Private therapy villages
  { id: 'private_therapy_parents',      name: 'Private Therapy Parents Village',           emoji: '🗓️', description: 'Navigating private therapy — scheduling, costs, and driving across town for your child' },
  { id: 'slp_therapy_parents',          name: 'Speech Therapy Parents Village',            emoji: '💬', description: 'Private SLP families — home programs, progress notes, and cheering every word', hidden: true },
  { id: 'ot_therapy_parents',           name: 'OT Parents Village',                        emoji: '✋', description: 'Private occupational therapy families — sensory diets, fine motor goals, and the journey', hidden: true },
  { id: 'pt_therapy_parents',           name: 'PT Parents Village',                        emoji: '🦵', description: 'Private physical therapy families — milestones, exercises, and watching them move', hidden: true },
  { id: 'vision_therapy_parents',       name: 'Vision Therapy Parents Village',            emoji: '👁️', description: 'Parents navigating vision therapy for their child', hidden: true },
  { id: 'child_mental_health_therapy',  name: 'Child Mental Health Therapy Parents',       emoji: '💛', description: 'Parents supporting a child in therapy — psychologists, counselors, and play therapy', hidden: true },
  { id: 'social_skills_therapy_parents', name: 'Social Skills Group Parents Village',      emoji: '🤝', description: 'Parents whose child attends social skills groups or group therapy', hidden: true },
  { id: 'aquatic_hippotherapy_parents', name: 'Aquatic & Equine Therapy Parents Village',  emoji: '🐴', description: 'Aquatic therapy and hippotherapy families — alternative therapy that changes everything', hidden: true },
  { id: 'school_services_only_parents', name: 'School-Based Services Only Parents',        emoji: '🏫', description: 'Families whose child receives all therapy through school — navigating what\'s offered and what\'s not', hidden: true },
  { id: 'therapy_waitlist_parents',     name: 'Therapy Waitlist Parents Village',          emoji: '⏳', description: 'Waiting for therapy to start — the lists are long and you are not alone', hidden: true },
  { id: 'therapy_graduate_parents',     name: 'Therapy Graduate Parents Village',          emoji: '🌟', description: 'Your child has completed therapy — celebrating progress and navigating what comes next', hidden: true },
  // ── Transportation villages
  { id: 'public_transit_parents',         name: 'Public Transit Parents Village',                emoji: '🚌', description: 'Navigating buses, trains, and subways with kids in tow — a whole adventure' },
  { id: 'no_car_parents',                 name: 'Car-Free Parents Village',                      emoji: '🚶', description: 'Raising kids without a car — creative, resourceful, and community-connected' },
  { id: 'unreliable_transportation_parents', name: 'Unreliable Transportation Parents Village',  emoji: '🔧', description: 'When getting somewhere is its own challenge — parents navigating transportation barriers', hidden: true },
  { id: 'rural_no_transit_parents',       name: 'Rural Parents — Limited Transit Village',       emoji: '🌾', description: 'Living in a rural area with no public transit — long distances, limited options', hidden: true },
  { id: 'city_bus_metro_parents',         name: 'City Bus & Metro Parents Village',              emoji: '🚇', description: 'Strollers on the subway, bus schedules with a toddler — you\'ve mastered it', hidden: true },
  { id: 'commuter_rail_parents',          name: 'Commuter Rail Parents Village',                 emoji: '🚆', description: 'Train commuters raising kids — schedule juggling at its finest', hidden: true },
  { id: 'paratransit_parents',            name: 'Paratransit & Accessible Transit Parents',      emoji: '♿', description: 'Parents using paratransit or accessible transit services with their children', hidden: true },
  { id: 'limited_transit_parents',        name: 'Limited Transit Options Parents Village',       emoji: '🚌', description: 'When the bus comes twice a day and that\'s your only option — you make it work', hidden: true },
  { id: 'one_car_household_parents',      name: 'One-Car Household Parents Village',             emoji: '🚗', description: 'Coordinating one car, two schedules, and a whole family — the logistics are real', hidden: true },
  { id: 'car_repairs_parents',            name: 'Car Trouble Parents Village',                   emoji: '🔧', description: 'When the car breaks down and you have kids to get places — solidarity', hidden: true },
  { id: 'rides_from_others_parents',      name: 'Relying on Others for Rides — Parents',        emoji: '🤝', description: 'Depending on others for transportation while raising children', hidden: true },
  { id: 'walkable_city_parents',          name: 'Walkable City Car-Free Parents Village',        emoji: '🚶', description: 'Car-free in a walkable city — strollers, carriers, and city life', hidden: true },
  // ── Food allergy villages
  { id: 'peanut_allergy_parents',         name: 'Peanut Allergy Parents Village',                emoji: '🥜', description: 'Navigating life with a peanut allergy — labels, school plans, and community', hidden: true },
  { id: 'tree_nut_allergy_parents',       name: 'Tree Nut Allergy Parents Village',              emoji: '🌰', description: 'Managing tree nut allergies — advocacy, label reading, and support', hidden: true },
  { id: 'dairy_allergy_parents',          name: 'Dairy / Milk Allergy Parents Village',          emoji: '🥛', description: 'Navigating dairy and milk protein allergies in children', hidden: true },
  { id: 'egg_allergy_parents',            name: 'Egg Allergy Parents Village',                   emoji: '🥚', description: 'Managing childhood egg allergies — baking swaps, school snacks, and more', hidden: true },
  { id: 'gluten_celiac_parents',          name: 'Celiac & Gluten Allergy Parents Village',       emoji: '🌾', description: 'Raising a child with celiac disease or a gluten allergy — a strict GF life', hidden: true },
  { id: 'multiple_allergy_parents',       name: 'Multiple Food Allergy Parents Village',         emoji: '⚠️', description: 'Juggling more than one food allergy — the planning, the labels, the vigilance', hidden: true },
  { id: 'anaphylaxis_parents',            name: 'Anaphylactic Allergy Parents Village',          emoji: '💉', description: 'Life with a child whose allergy can be life-threatening — epi-pens, school plans, and solidarity', hidden: true },
  { id: 'eoe_parents',                    name: 'Eosinophilic Esophagitis (EoE) Parents Village', emoji: '🍽️', description: 'EoE families — navigating elimination diets, scopes, and the ongoing journey', hidden: true },
  { id: 'fpies_parents',                  name: 'FPIES Parents Village',                         emoji: '⚠️', description: 'Food Protein-Induced Enterocolitis Syndrome — the FPIES community', hidden: true },
  // ── Special / medical diet villages
  { id: 'gluten_free_family',             name: 'Gluten-Free Family Village',                    emoji: '🌾', description: 'Raising a gluten-free family — celiac, sensitivity, or choice', hidden: true },
  { id: 'vegan_family',                   name: 'Vegan Family Village',                          emoji: '🌱', description: 'Raising vegan kids — nutrition, social situations, and solidarity', hidden: true },
  { id: 'vegetarian_family',              name: 'Vegetarian Family Village',                     emoji: '🥦', description: 'Raising vegetarian children — recipes, school lunches, and community', hidden: true },
  { id: 'kosher_family',                  name: 'Kosher Family Village',                         emoji: '✡️', description: 'Keeping kosher with kids — the planning, the holidays, and the community', hidden: true },
  { id: 'halal_family',                   name: 'Halal Family Village',                          emoji: '☪️', description: 'Raising children on a halal diet — sourcing, school, and community', hidden: true },
  { id: 'elimination_diet_parents',       name: 'Elimination Diet Parents Village',              emoji: '🍽️', description: 'Navigating an elimination diet with your child — the restrictions, the hope, the results', hidden: true },
  ...DUE_DATE_VILLAGES,
  ...CHILD_AGE_VILLAGES,
  ...LOCATION_VILLAGES,
];

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
  const [joinedIds, setJoinedIds]       = useState<Set<string>>(new Set());
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
        <View style={s.center}><ActivityIndicator size="large" color="#B1A7F0" /></View>
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
            placeholderTextColor="#B0A89E"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

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
              {myVillages.map(v => (
                <TouchableOpacity
                  key={v.id}
                  style={s.joinedChip}
                  onPress={() => toggleJoin(v.id)}
                  activeOpacity={0.75}
                >
                  <Text style={s.joinedChipEmoji}>{v.emoji}</Text>
                  <Text style={s.joinedChipName} numberOfLines={1}>{v.name}</Text>
                  <Text style={s.joinedChipLeave}>✕</Text>
                </TouchableOpacity>
              ))}
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
                <View style={{ flex: quizStep + 1, backgroundColor: '#FA92B1', borderRadius: 3 }} />
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
            placeholderTextColor="#B0A89E"
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
            placeholderTextColor="#B0A89E"
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

const lp = StyleSheet.create({
  label:      { fontSize: 13, fontWeight: '700', color: '#8A7E78', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5, borderColor: '#EAE5DF',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#3D3530', marginBottom: 8,
  },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EAE5DF' },
  chipSelected: { backgroundColor: '#FDE4DE', borderColor: '#FA92B1' },
  chipText:   { fontSize: 13, color: '#5A544E', fontWeight: '500' },
  chipTextSelected: { color: '#3D3530', fontWeight: '700' },
  requestBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: '#EAE5DF', borderStyle: 'dashed' },
  requestBtnText: { fontSize: 13, color: '#B0A89E', fontWeight: '500' },
});

// ─── Village card sub-component ───────────────────────────────────────────────

function VillageCard({
  village, joining, joined = false, onJoin, fullWidth = false,
}: {
  village: Village;
  joining: boolean;
  joined?: boolean;
  onJoin: () => void;
  fullWidth?: boolean;
}) {
  return (
    <View style={[s.villageCard, fullWidth && { width: '100%' }]}>
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FEFCF8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 24, paddingBottom: 40 },

  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#5A544E',
    marginBottom: 16,
  },

  // ── Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EAE5DF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: '#5A544E', padding: 0 },
  searchClear: { fontSize: 14, color: '#B0A89E', paddingHorizontal: 4 },

  // ── Quiz card
  quizCard: {
    backgroundColor: '#FDE4DE',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    borderLeftWidth: 5,
    borderLeftColor: '#FA92B1',
    gap: 14,
    shadowColor: '#FA92B1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  quizCardEmoji: { fontSize: 32 },
  quizCardBody: { flex: 1 },
  quizCardTitle: { fontSize: 17, fontWeight: '800', color: '#5A544E', marginBottom: 4 },
  quizCardSub: { fontSize: 13, color: '#8A7E78', lineHeight: 18 },
  quizCardArrow: { fontSize: 22, color: '#FA92B1', fontWeight: '600' },

  // ── Retake quiz row
  retakeRow: {
    backgroundColor: '#F4F1FB',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
    borderLeftWidth: 5,
    borderLeftColor: '#B1A7F0',
    gap: 14,
  },
  retakeIcon:  { fontSize: 26 },
  retakeBody:  { flex: 1 },
  retakeTitle: { fontSize: 15, fontWeight: '700', color: '#5A544E', marginBottom: 2 },
  retakeSub:   { fontSize: 12, color: '#8A7E78' },
  retakeArrow: { fontSize: 22, color: '#B1A7F0', fontWeight: '600' },

  // ── Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5A544E',
    marginBottom: 12,
  },

  // ── My Villages
  joinedScroll: { marginBottom: 28 },
  joinedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D3E5CF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#94B58C',
    maxWidth: 180,
  },
  joinedChipEmoji: { fontSize: 18 },
  joinedChipName: { fontSize: 13, fontWeight: '700', color: '#3D3530', flex: 1 },
  joinedChipLeave: { fontSize: 11, color: '#AEBCB1' },

  // ── Village card
  villageCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  villageEmoji: { fontSize: 28 },
  villageInfo: { flex: 1 },
  villageName: { fontSize: 15, fontWeight: '700', color: '#3D3530', marginBottom: 2 },
  villageDesc: { fontSize: 12, color: '#B0A89E', lineHeight: 17 },
  joinBtn: {
    backgroundColor: '#B1A7F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 68,
    alignItems: 'center',
  },
  joinBtnJoined: { backgroundColor: '#D3E5CF' },
  joinBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  joinBtnTextJoined: { color: '#94B58C' },

  // ── Empty search
  emptySearch: { padding: 40, alignItems: 'center' },
  emptySearchEmoji: { fontSize: 36, marginBottom: 12 },
  emptySearchText: { fontSize: 14, color: '#B0A89E', textAlign: 'center' },

  // ── Quiz modal
  modalSafe: { flex: 1, backgroundColor: '#FEFCF8' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE4',
  },
  modalCloseBtn: { width: 40, alignItems: 'flex-start' },
  modalCloseText: { fontSize: 18, color: '#B0A89E' },
  modalStep: { fontSize: 14, fontWeight: '600', color: '#B0A89E' },

  // ── Quiz question
  quizContent: { padding: 24, paddingBottom: 40 },
  progressBar: {
    flexDirection: 'row',
    height: 6,
    backgroundColor: '#F0EBE4',
    borderRadius: 3,
    marginBottom: 32,
    overflow: 'hidden',
  },
  questionText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#3D3530',
    lineHeight: 28,
    marginBottom: 8,
  },
  questionSub: { fontSize: 13, color: '#B0A89E', marginBottom: 20 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#EAE5DF',
    gap: 12,
  },
  optionBtnSelected: { backgroundColor: '#FDE4DE', borderColor: '#FA92B1' },
  optionDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D0C8C0',
    backgroundColor: '#fff',
  },
  optionDotSelected: { backgroundColor: '#FA92B1', borderColor: '#FA92B1' },
  optionText: { flex: 1, fontSize: 15, color: '#5A544E', fontWeight: '500' },
  optionTextSelected: { fontWeight: '700', color: '#3D3530' },
  quizNavRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 12 },
  backBtnText: { fontSize: 15, color: '#B0A89E', fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#B1A7F0',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  nextBtnDisabled: { backgroundColor: '#D5D0C8' },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Quiz results
  resultsContent: { padding: 24, paddingBottom: 40, alignItems: 'center' },
  resultsEmoji: { fontSize: 52, marginTop: 16, marginBottom: 16 },
  resultsTitle: { fontSize: 22, fontWeight: '800', color: '#3D3530', marginBottom: 8, textAlign: 'center' },
  resultsSub: { fontSize: 14, color: '#8A7E78', textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 8 },
  joinAllBtn: {
    backgroundColor: '#FA92B1',
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
  skipBtnText: { fontSize: 14, color: '#B0A89E', fontWeight: '600' },
});
