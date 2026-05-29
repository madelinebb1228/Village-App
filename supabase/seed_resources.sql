-- Local Resources Seed Data
-- Run this in Supabase SQL Editor to populate the local_resources table.
-- "Statewide" entries have city = NULL so they appear for any city in that state.

INSERT INTO local_resources (name, description, phone, website, service_type, city, state, country) VALUES

-- ══════════ MAINE ══════════
('Maine WIC - Augusta', 'WIC nutrition benefits, formula, and healthy foods for moms and children under 5.', '(207) 287-3991', 'maine.gov/dhhs/mecdc/population-health/wic', 'wic', 'Augusta', 'Maine', 'United States'),
('Bangor Public Health WIC', 'WIC office serving the Bangor area.', '207-992-4570', 'bangorpublichealth.org/families-with-children/wic', 'wic', 'Bangor', 'Maine', 'United States'),
('YCCAC WIC - Biddeford', 'WIC office serving York and Cumberland counties.', '(207) 283-2402', 'yccac.org/children-family/wic-nutrition-breastfeeding-support', 'wic', 'Biddeford', 'Maine', 'United States'),
('Opportunity Alliance WIC - Portland', 'WIC nutrition program serving Greater Portland.', '207-553-5800', 'opportunityalliance.org/wic', 'wic', 'Portland', 'Maine', 'United States'),
('Maine Jewish Community Diaper Bank', 'Free diapers for families in need in the Portland area.', NULL, 'mainejewish.org/Diaperbank', 'diapers', 'Portland', 'Maine', 'United States'),
('Good Shepherd Food Bank', 'Maine''s largest hunger relief organization serving all 16 counties.', '(207) 653-8159', 'mainefeeding.org', 'food_pantry', 'Hampden', 'Maine', 'United States'),
('Maine Early Intervention', 'Free developmental services for children 0–3 with delays or disabilities.', '207-874-1140', 'maine.gov/dhhs/ocfs/support-for-families/early-intervention', 'early_intervention', 'Portland', 'Maine', 'United States'),
('Maine Parent Federation', 'Statewide parent support and advocacy for families of children with disabilities.', '1-800-639-1599', 'maineparentfederation.org', 'support', NULL, 'Maine', 'United States'),
('211 Maine', 'Call or text 211 to connect with local services across Maine.', '211', '211maine.org', 'other', NULL, 'Maine', 'United States'),

-- ══════════ NEW HAMPSHIRE ══════════
('New Hampshire WIC', 'Statewide WIC program for NH families.', '1-800-942-4321', 'dhhs.nh.gov/programs-services/population-health/women-infants-children', 'wic', NULL, 'New Hampshire', 'United States'),
('New Hampshire Food Bank', 'Statewide food bank serving all of New Hampshire.', '(603) 669-9725', 'nhfoodbank.org', 'food_pantry', 'Manchester', 'New Hampshire', 'United States'),
('NH Family Voices', 'Support for NH families of children and youth with special health care needs.', '(603) 224-7005', 'nhfv.org', 'support', 'Concord', 'New Hampshire', 'United States'),
('211 NH', 'Call or text 211 to connect with local services across New Hampshire.', '211', '211nh.org', 'other', NULL, 'New Hampshire', 'United States'),

-- ══════════ VERMONT ══════════
('Vermont WIC', 'Statewide WIC program for Vermont families.', '800-464-4343', 'healthvermont.gov/family/wic', 'wic', NULL, 'Vermont', 'United States'),
('Vermont WIC - White River Junction', 'WIC office serving the Upper Valley region.', '802-295-8820', 'healthvermont.gov/local/white-river-junction/wic-white-river-junction', 'wic', 'White River Junction', 'Vermont', 'United States'),
('Vermont Foodbank', 'Statewide food bank serving Vermont communities.', '(800) 585-2265', 'vtfoodbank.org', 'food_pantry', 'Barre', 'Vermont', 'United States'),
('Vermont Family Network', 'Support and advocacy for Vermont families of children with disabilities.', '802-876-5315', 'vfnash.org', 'support', NULL, 'Vermont', 'United States'),
('Vermont 211', 'Call or text 211 to connect with local services across Vermont.', '211', 'vermont211.org', 'other', NULL, 'Vermont', 'United States'),

-- ══════════ MASSACHUSETTS ══════════
('Massachusetts WIC', 'Statewide WIC program for Massachusetts families.', '1-800-942-1007', 'mass.gov/wic', 'wic', NULL, 'Massachusetts', 'United States'),
('United Way Diaper Drive - Northampton', 'Free diapers for families in Western Massachusetts.', '413-584-3962', 'uw-fh.org/diaper-drive', 'diapers', 'Northampton', 'Massachusetts', 'United States'),
('Greater Boston Food Bank', 'Largest hunger-relief organization in New England.', '(617) 427-5200', 'gbfb.org', 'food_pantry', 'Boston', 'Massachusetts', 'United States'),
('Massachusetts Early Intervention', 'Free services for infants and toddlers 0–3 with developmental needs.', '800-882-1435', 'mass.gov/early-intervention', 'early_intervention', NULL, 'Massachusetts', 'United States'),
('MSPCC Parent Support', 'Family support services for Massachusetts parents.', '617-542-3678', 'mspcc.org', 'support', 'Boston', 'Massachusetts', 'United States'),
('Boston Children''s Hospital Parenting Journey', 'Parenting classes and support for Boston-area families.', '617-983-6800', 'childrenshospital.org', 'parenting', 'Boston', 'Massachusetts', 'United States'),
('211 Massachusetts', 'Call or text 211 to connect with local services across Massachusetts.', '211', 'mass211.org', 'other', NULL, 'Massachusetts', 'United States'),

-- ══════════ RHODE ISLAND ══════════
('Rhode Island WIC', 'Statewide WIC program for Rhode Island families.', '401-222-5960', 'health.ri.gov/programs/wic', 'wic', NULL, 'Rhode Island', 'United States'),
('Rhode Island Community Food Bank', 'Statewide food bank serving Rhode Island.', '(401) 942-6325', 'rifoodbank.org', 'food_pantry', 'Providence', 'Rhode Island', 'United States'),
('Meeting Street Early Intervention', 'Early intervention and developmental services for RI children 0–3.', '(401) 533-9100', 'meetingstreet.org', 'early_intervention', 'Providence', 'Rhode Island', 'United States'),
('Parent Support Network of Rhode Island', 'Peer support and resources for RI families of children with mental health needs.', '(401) 467-6855', 'psnri.org', 'support', 'Warwick', 'Rhode Island', 'United States'),
('PSN RI Parenting Classes', 'Parenting education classes for Rhode Island families.', '(401) 467-6855', 'psnri.org/our-services/child-family-support.html', 'parenting', NULL, 'Rhode Island', 'United States'),
('211 Rhode Island', 'Call or text 211 to connect with local services across Rhode Island.', '211', 'uwri.org/211-helpline', 'other', NULL, 'Rhode Island', 'United States'),

-- ══════════ CONNECTICUT ══════════
('Connecticut WIC', 'Statewide WIC program for Connecticut families.', '1-800-741-2142', 'portal.ct.gov/dph/WIC', 'wic', NULL, 'Connecticut', 'United States'),
('Connecticut Diaper Bank', 'Free diapers for families in need across Connecticut.', '(203) 821-7348', 'nationaldiaperbanknetwork.org', 'diapers', 'New Haven', 'Connecticut', 'United States'),
('Connecticut Food Bank', 'Statewide food bank serving Connecticut communities.', '(203) 469-5000', 'ctfoodbank.org', 'food_pantry', 'Wallingford', 'Connecticut', 'United States'),
('Connecticut Birth to Three', 'Free early intervention services for CT children 0–3 with developmental needs.', '1-800-505-7000', 'portal.ct.gov/birth23', 'early_intervention', NULL, 'Connecticut', 'United States'),
('CT Parent Advocacy Center', 'Statewide parent support and advocacy for CT families.', '1-800-842-2288', 'ctparentadvocacy.org', 'support', NULL, 'Connecticut', 'United States'),
('CT DCF Parenting Classes', 'Free parenting education and family support classes.', '203-500-4478', 'ct.gov/dcf', 'parenting', NULL, 'Connecticut', 'United States'),
('211 Connecticut', 'Call or text 211 to connect with local services across Connecticut.', '211', '211ct.org', 'other', NULL, 'Connecticut', 'United States'),

-- ══════════ NEW YORK ══════════
('New York State WIC', 'Statewide WIC program for New York families.', '1-800-522-5006', 'health.ny.gov/prevention/nutrition/wic', 'wic', NULL, 'New York', 'United States'),
('New York Diaper Bank', 'Free diapers for families in the New York City area.', NULL, 'nationaldiaperbanknetwork.org/member-directory', 'diapers', 'New York City', 'New York', 'United States'),
('Food Bank for New York City', 'New York City''s largest food bank.', '212-566-7855', 'foodbanknyc.org', 'food_pantry', 'New York City', 'New York', 'United States'),
('NY Early Intervention Program', 'Free early intervention services for NY children under age 3.', '518-473-7016', 'health.ny.gov/community/infants_children/early_intervention', 'early_intervention', NULL, 'New York', 'United States'),
('Parent Network', 'Parent support and advocacy for NY families of children with disabilities.', '1-800-342-9871', 'parentnetworkwny.org', 'support', NULL, 'New York', 'United States'),
('NYC Early Learn Parenting', 'NYC parenting programs and family support. Call 311 for local programs.', '311', 'nyc.gov/site/acs/early-care/earlylearn.page', 'parenting', 'New York City', 'New York', 'United States'),
('211 New York', 'Call or text 211 to connect with local services across New York.', '211', '211nys.org', 'other', NULL, 'New York', 'United States'),

-- ══════════ NEW JERSEY ══════════
('New Jersey WIC', 'Statewide WIC program for New Jersey families.', '1-800-328-3838', 'nj.gov/health/fhs/wic', 'wic', NULL, 'New Jersey', 'United States'),
('New Jersey Diaper Bank', 'Free diapers for families in New Jersey.', NULL, 'nationaldiaperbanknetwork.org/member-directory', 'diapers', NULL, 'New Jersey', 'United States'),
('Community FoodBank of NJ', 'Statewide food bank serving New Jersey communities.', '(908) 355-3663', 'cfbnj.org', 'food_pantry', 'Hillside', 'New Jersey', 'United States'),
('NJ Early Intervention System', 'Free early intervention services for NJ children under age 3.', '609-987-7337', 'nj.gov/health/fhs/eis', 'early_intervention', NULL, 'New Jersey', 'United States'),
('Statewide Parent Advocacy Network NJ', 'Support and information for NJ families of children with disabilities.', '1-877-652-7624', 'spannj.org', 'support', NULL, 'New Jersey', 'United States'),
('211 New Jersey', 'Call or text 211 to connect with local services across New Jersey.', '211', 'nj211.org', 'other', NULL, 'New Jersey', 'United States'),

-- ══════════ PENNSYLVANIA ══════════
('Pennsylvania WIC', 'Statewide WIC program for Pennsylvania families.', '1-800-942-9467', 'health.pa.gov/topics/programs/WIC', 'wic', NULL, 'Pennsylvania', 'United States'),
('Pennsylvania Diaper Bank', 'Free diapers for families in the Scranton area.', NULL, 'nationaldiaperbanknetwork.org/member-directory', 'diapers', 'Scranton', 'Pennsylvania', 'United States'),
('Central PA Food Bank', 'Food bank serving South Central Pennsylvania.', '(717) 564-1700', 'centralpafoodbank.org', 'food_pantry', 'Harrisburg', 'Pennsylvania', 'United States'),
('PA Early Intervention', 'Free early intervention services for PA children under age 3.', '1-800-986-4550', 'dhs.pa.gov/Services/Children/Pages/Early-Intervention-Services.aspx', 'early_intervention', NULL, 'Pennsylvania', 'United States'),
('Parent to Parent of PA', 'One-to-one support matching for PA families of children with special needs.', '1-800-441-3215', 'parenttoparent.org', 'support', NULL, 'Pennsylvania', 'United States'),
('211 Pennsylvania', 'Call or text 211 to connect with local services across Pennsylvania.', '211', 'pa211.org', 'other', NULL, 'Pennsylvania', 'United States'),

-- ══════════ MARYLAND ══════════
('Maryland WIC', 'Statewide WIC hotline for Maryland families.', '1-800-242-4942', 'health.maryland.gov', 'wic', NULL, 'Maryland', 'United States'),
('Baltimore City WIC', 'WIC office serving Baltimore City.', '(410) 396-9427', 'health.maryland.gov', 'wic', 'Baltimore', 'Maryland', 'United States'),
('Anne Arundel County WIC', 'WIC services for Anne Arundel County families.', '(410) 222-6797', 'health.maryland.gov', 'wic', NULL, 'Maryland', 'United States'),
('Baltimore County WIC', 'WIC services for Baltimore County families.', '(410) 887-6000', 'health.maryland.gov', 'wic', NULL, 'Maryland', 'United States'),
('Montgomery County WIC', 'WIC services for Montgomery County families.', '(301) 762-9426', 'health.maryland.gov', 'wic', NULL, 'Maryland', 'United States'),
('Maryland Diaper Bank', 'Free diapers statewide for Maryland families in need.', '240-844-2307', 'marylanddiaperbank.org', 'diapers', NULL, 'Maryland', 'United States'),
('Greater DC Diaper Bank', 'Free diapers for families in the DC metro area including Maryland.', '(202) 702-4001', 'greaterdcdiaperbank.org', 'diapers', NULL, 'Maryland', 'United States'),

-- ══════════ WASHINGTON D.C. ══════════
('Greater DC Diaper Bank', 'Free diapers for families in the Washington DC area.', '(202) 702-4001', 'greaterdcdiaperbank.org', 'diapers', NULL, 'Washington D.C.', 'United States'),

-- ══════════ DELAWARE ══════════
('Delaware WIC', 'Statewide WIC program for Delaware families.', '302-283-7540', 'delaware.wicresources.org', 'wic', NULL, 'Delaware', 'United States'),
('New Castle County WIC', 'WIC office serving New Castle County.', '(302) 605-4066', 'dhss.delaware.gov', 'wic', 'Wilmington', 'Delaware', 'United States'),
('Kent County WIC', 'WIC office serving Kent County.', '(302) 605-1833', 'dhss.delaware.gov', 'wic', 'Dover', 'Delaware', 'United States'),
('Sussex County WIC', 'WIC office serving Sussex County.', '(302) 605-4055', 'dhss.delaware.gov', 'wic', NULL, 'Delaware', 'United States'),

-- ══════════ VIRGINIA ══════════
('Virginia WIC', 'Statewide WIC program for Virginia families.', NULL, 'vdh.virginia.gov', 'wic', NULL, 'Virginia', 'United States'),
('Greater DC Diaper Bank - Virginia', 'Free diapers for Northern Virginia families.', '(202) 702-4001', 'greaterdcdiaperbank.org', 'diapers', NULL, 'Virginia', 'United States'),

-- ══════════ WEST VIRGINIA ══════════
('West Virginia WIC', 'Statewide WIC program for West Virginia families.', NULL, 'dhhr.wv.gov/wic', 'wic', NULL, 'West Virginia', 'United States'),

-- ══════════ NORTH CAROLINA ══════════
('North Carolina WIC', 'Statewide WIC program for North Carolina families.', '1-844-601-6881', 'ncdhhs.gov/ncwic', 'wic', NULL, 'North Carolina', 'United States'),
('Forsyth County WIC', 'WIC services for Forsyth County.', '336-703-3336', 'co.forsyth.nc.us', 'wic', NULL, 'North Carolina', 'United States'),
('Lee County WIC', 'WIC services for Lee County.', '(919) 718-4642', 'leecountync.gov', 'wic', NULL, 'North Carolina', 'United States'),
('Beaufort County WIC', 'WIC services for Beaufort County.', '252-946-9705', 'co.beaufort.nc.us', 'wic', NULL, 'North Carolina', 'United States'),
('Onslow County WIC', 'WIC services for Onslow County.', '910-347-5002', 'onslowcountync.gov', 'wic', NULL, 'North Carolina', 'United States'),

-- ══════════ SOUTH CAROLINA ══════════
('South Carolina WIC', 'Statewide WIC program for South Carolina families.', NULL, 'scdhec.gov/wic', 'wic', NULL, 'South Carolina', 'United States'),

-- ══════════ KENTUCKY ══════════
('God''s Pantry Food Bank', 'Food bank serving Central and Eastern Kentucky.', '859-255-6592', 'godspantry.org', 'food_pantry', 'Lexington', 'Kentucky', 'United States'),
('Dare to Care Food Bank', 'Food bank serving 10 Kentucky counties in the Louisville metro area.', '502-966-3821', 'daretocare.org', 'food_pantry', 'Louisville', 'Kentucky', 'United States'),
('Feeding America Kentucky''s Heartland', 'Food bank serving 40 counties in Central and Western Kentucky.', '270-769-6997', 'feedingamericaky.org', 'food_pantry', 'Elizabethtown', 'Kentucky', 'United States'),
('Thankful Hearts Food Pantry', 'Free food pantry serving Pike County families.', '(606) 424-6858', NULL, 'food_pantry', NULL, 'Kentucky', 'United States'),

-- ══════════ TENNESSEE ══════════
('Feeding America Tennessee', 'Find Tennessee food banks at feedingamerica.org.', NULL, 'feedingamerica.org', 'food_pantry', NULL, 'Tennessee', 'United States'),
('People Helping People', 'Food pantry and community support in Benton, TN.', '(423) 299-9062', 'peoplehelpingpeopletn.org', 'food_pantry', 'Benton', 'Tennessee', 'United States'),
('Dayton Church of God Food Pantry', 'Free food pantry serving the Dayton, TN area.', '(423) 775-2769', 'daytonchurchofgod.com', 'food_pantry', 'Dayton', 'Tennessee', 'United States'),
('Soddy Daisy Food Pantry', 'Community food pantry serving Soddy Daisy, TN.', '(423) 648-5922', NULL, 'food_pantry', 'Soddy Daisy', 'Tennessee', 'United States'),

-- ══════════ OHIO ══════════
('Ohio WIC', 'Statewide WIC program for Ohio families.', '1-800-755-4769', 'odh.ohio.gov/wic', 'wic', NULL, 'Ohio', 'United States'),
('Mid-Ohio Food Collective', 'Food bank serving 20 Ohio counties in Central Ohio.', '614-277-3663', 'midohiofoodbank.org', 'food_pantry', 'Columbus', 'Ohio', 'United States'),
('Ohio Early Intervention', 'Free early intervention services for Ohio children under age 3.', '1-800-755-4769', 'ohioearlyintervention.org', 'early_intervention', NULL, 'Ohio', 'United States'),
('Action for Children', 'Parent support and childcare resources in Central Ohio.', '614-224-0222', 'actionforchildren.org', 'support', 'Columbus', 'Ohio', 'United States'),
('Nationwide Children''s Triple P', 'Evidence-based parenting classes for Ohio families.', '614-355-8099', 'nationwidechildrens.org/triple-p', 'parenting', NULL, 'Ohio', 'United States'),

-- ══════════ INDIANA ══════════
('Indiana WIC', 'Statewide WIC program for Indiana families.', '1-800-522-0874', 'in.gov/health/wic', 'wic', NULL, 'Indiana', 'United States'),
('Gleaners Food Bank', 'Food bank serving Central Indiana.', '317-925-0191', 'indyhunger.org', 'food_pantry', 'Indianapolis', 'Indiana', 'United States'),
('Indiana First Steps', 'Early intervention services for Indiana children under age 3.', '1-800-742-7432', 'in.gov/fssa/firststeps', 'early_intervention', NULL, 'Indiana', 'United States'),
('Indy Diaper Bank', 'Free diapers for Indianapolis-area families in need.', '317-920-4923', 'indydiaperbank.org', 'diapers', 'Indianapolis', 'Indiana', 'United States'),
('Early Learning Indiana', 'Parent support and early learning resources statewide.', '1-800-933-7458', 'earlylearningin.org', 'support', NULL, 'Indiana', 'United States'),

-- ══════════ ILLINOIS ══════════
('Illinois WIC', 'Statewide WIC program for Illinois families.', '1-800-323-4769', 'dhs.state.il.us/wic', 'wic', NULL, 'Illinois', 'United States'),
('Eastern Illinois Foodbank', 'Food bank serving East-Central Illinois.', '217-328-3663', 'eifoodbank.org', 'food_pantry', 'Urbana', 'Illinois', 'United States'),
('Central Illinois Food Bank', 'Food bank serving 21 counties in Central Illinois.', '217-522-4022', 'centralilfoodbank.org', 'food_pantry', 'Springfield', 'Illinois', 'United States'),
('Northern Illinois Food Bank', 'Food bank serving 13 counties in Northern Illinois.', '630-443-6910', 'solvehungertoday.org', 'food_pantry', 'Geneva', 'Illinois', 'United States'),
('Illinois Early Intervention', 'Free early intervention services for Illinois children under age 3.', '1-800-447-6404', 'dhs.state.il.us/ei', 'early_intervention', NULL, 'Illinois', 'United States'),

-- ══════════ MICHIGAN ══════════
('Michigan WIC', 'Statewide WIC program for Michigan families.', '1-800-26-BIRTH', 'michigan.gov/wic', 'wic', NULL, 'Michigan', 'United States'),
('Feeding West Michigan', 'Food bank serving Kent and surrounding counties.', '616-784-3250', 'feedwm.org', 'food_pantry', 'Grand Rapids', 'Michigan', 'United States'),
('Food Bank of Eastern Michigan', 'Food bank serving Flint and Eastern Michigan communities.', '810-239-4441', 'fbem.org', 'food_pantry', 'Flint', 'Michigan', 'United States'),
('Michigan Early On', 'Early intervention services for Michigan children under age 3.', '1-800-327-5966', '1800earlyon.org', 'early_intervention', NULL, 'Michigan', 'United States'),
('CARE of Southeastern Michigan', 'Parenting classes and family support in Macomb County.', '586-541-2273', 'careofsem.com', 'parenting', NULL, 'Michigan', 'United States'),

-- ══════════ WISCONSIN ══════════
('Wisconsin WIC', 'Statewide WIC program for Wisconsin families.', '1-800-722-2295', 'dhs.wisconsin.gov/wic', 'wic', NULL, 'Wisconsin', 'United States'),
('Feeding America Wisconsin', 'Food bank serving Southeastern Wisconsin.', '414-777-0483', 'feedingamericawi.org', 'food_pantry', 'Milwaukee', 'Wisconsin', 'United States'),
('Wisconsin Birth to 3', 'Early intervention services for Wisconsin children under age 3.', '1-800-642-7837', 'dhs.wisconsin.gov/birthto3', 'early_intervention', NULL, 'Wisconsin', 'United States'),
('Milwaukee Diaper Bank', 'Free diapers for Milwaukee-area families.', '414-897-0461', 'mkediaperbank.org', 'diapers', 'Milwaukee', 'Wisconsin', 'United States'),
('Family Support Network Wisconsin', 'Statewide parent support groups and resources.', '1-800-362-7353', 'supportfamily.org', 'support', NULL, 'Wisconsin', 'United States'),

-- ══════════ MINNESOTA ══════════
('Minnesota WIC', 'Statewide WIC program for Minnesota families.', '1-800-657-3942', 'health.state.mn.us/wic', 'wic', NULL, 'Minnesota', 'United States'),
('Second Harvest Heartland', 'Largest food bank in the Upper Midwest, serving MN and WI.', '763-450-3860', '2harvest.org', 'food_pantry', 'Brooklyn Park', 'Minnesota', 'United States'),
('Diaper Bank of Minnesota', 'Free diapers for Twin Cities and Greater MN families.', '651-788-3862', 'diaperbankmn.org', 'diapers', 'Saint Paul', 'Minnesota', 'United States'),
('Minnesota Help Me Grow', 'Early childhood developmental resources and EI referrals.', '651-582-8200', 'education.mn.gov', 'early_intervention', NULL, 'Minnesota', 'United States'),
('PACER Center', 'Parent advocacy and support for MN families of children with disabilities.', '952-838-9000', 'pacer.org', 'support', 'Bloomington', 'Minnesota', 'United States'),

-- ══════════ IOWA ══════════
('Iowa WIC', 'Statewide WIC program for Iowa families.', '1-800-532-1579', 'hhs.iowa.gov/wic', 'wic', NULL, 'Iowa', 'United States'),
('HACAP Food Reservoir', 'Food bank serving Hawkeye and surrounding Iowa counties.', '319-393-7811', 'hacap.org', 'food_pantry', NULL, 'Iowa', 'United States'),
('Food Bank of Iowa', 'Statewide food bank serving Iowa communities.', '515-287-3663', 'foodbankiowa.org', 'food_pantry', 'Des Moines', 'Iowa', 'United States'),
('Central Iowa Diaper Bank', 'Free diapers for families in Central Iowa.', '515-288-1311', 'centraliowa.org', 'diapers', 'Des Moines', 'Iowa', 'United States'),
('Iowa Family Support Network', 'Early intervention and family support services statewide.', '1-888-425-4371', 'iafamilysupportnetwork.org', 'early_intervention', NULL, 'Iowa', 'United States'),

-- ══════════ MISSOURI ══════════
('Missouri WIC', 'Statewide WIC program for Missouri families.', '1-800-392-8209', 'health.mo.gov/wic', 'wic', NULL, 'Missouri', 'United States'),
('St. Louis Area Foodbank', 'Food bank serving 26 counties in Missouri and Illinois.', '314-292-6262', 'stlfoodbank.org', 'food_pantry', 'Saint Louis', 'Missouri', 'United States'),
('Harvesters Community Food Network', 'Food bank serving 26 counties in Missouri and Kansas.', '816-929-3000', 'harvesters.org', 'food_pantry', 'Kansas City', 'Missouri', 'United States'),
('Happy Bottoms', 'Free diapers for Kansas City-area families in need.', '855-479-2867', 'happybottoms.org', 'diapers', 'Kansas City', 'Missouri', 'United States'),
('Missouri First Steps', 'Early intervention services for Missouri children under age 3.', '1-866-583-2392', 'dese.mo.gov/first-steps', 'early_intervention', NULL, 'Missouri', 'United States'),

-- ══════════ NORTH DAKOTA ══════════
('North Dakota WIC', 'Statewide WIC program for North Dakota families.', '1-800-472-2286', 'hhs.nd.gov/wic', 'wic', NULL, 'North Dakota', 'United States'),
('Great Plains Food Bank', 'Largest hunger-relief organization in North Dakota.', '701-232-6219', 'greatplainsfoodbank.org', 'food_pantry', 'Fargo', 'North Dakota', 'United States'),
('Village Family Service Center', 'Diaper bank and family services in Fargo, ND.', '701-235-5437', 'villagefamilyservice.org', 'diapers', 'Fargo', 'North Dakota', 'United States'),
('North Dakota Right Track', 'Early intervention services for ND children under age 3.', '1-800-755-8529', 'hhs.nd.gov', 'early_intervention', NULL, 'North Dakota', 'United States'),
('My First Link ND', 'Parent support and community connections statewide.', '211', 'myfirstlink.org', 'support', NULL, 'North Dakota', 'United States'),

-- ══════════ SOUTH DAKOTA ══════════
('South Dakota WIC', 'Statewide WIC program for South Dakota families.', '1-800-738-2301', 'doh.sd.gov/wic', 'wic', NULL, 'South Dakota', 'United States'),
('Feeding South Dakota', 'Statewide food bank serving South Dakota communities.', '605-335-0364', 'feedingsouthdakota.org', 'food_pantry', 'Sioux Falls', 'South Dakota', 'United States'),
('South Dakota Diaper Bank', 'Free diapers for South Dakota families in need.', '605-988-3650', 'sdedico.org', 'diapers', 'Sioux Falls', 'South Dakota', 'United States'),
('South Dakota Birth to 3', 'Early intervention services for SD children under age 3.', '1-800-265-9684', 'doe.sd.gov/birthto3', 'early_intervention', NULL, 'South Dakota', 'United States'),
('Helfen Helps SD', 'Parent support network statewide.', '211', 'helfenhelps.org', 'support', NULL, 'South Dakota', 'United States'),

-- ══════════ NEBRASKA ══════════
('Nebraska WIC', 'Statewide WIC program for Nebraska families.', '1-800-942-1171', 'dhhs.ne.gov/wic', 'wic', NULL, 'Nebraska', 'United States'),
('Food Bank of the Heartland', 'Food bank serving 93 counties in Nebraska and Iowa.', '402-331-1213', 'foodbankheartland.org', 'food_pantry', 'Omaha', 'Nebraska', 'United States'),
('Lincoln Food Bank', 'Food bank serving the Lincoln metro area.', '402-466-8170', 'lincolnfoodbank.org', 'food_pantry', 'Lincoln', 'Nebraska', 'United States'),
('Omaha Diaper Bank', 'Free diapers for Omaha-area families in need.', '402-880-3548', 'omahadiaperbank.org', 'diapers', 'Omaha', 'Nebraska', 'United States'),
('Nebraska Early Development Network', 'Early intervention services for Nebraska children under age 3.', '1-888-806-6287', 'dhhs.ne.gov', 'early_intervention', NULL, 'Nebraska', 'United States'),

-- ══════════ KANSAS ══════════
('Kansas WIC', 'Statewide WIC program for Kansas families.', '1-800-332-5802', 'kdhe.ks.gov/wic', 'wic', NULL, 'Kansas', 'United States'),
('Kansas Food Bank', 'Food bank serving Central and Western Kansas.', '316-265-3663', 'kansasfoodbank.org', 'food_pantry', 'Wichita', 'Kansas', 'United States'),
('Harvesters Community Food Network KS', 'Food bank serving the Kansas City metro area.', '913-371-0100', 'harvesters.org', 'food_pantry', 'Kansas City', 'Kansas', 'United States'),
('Kansas City Diaper Bank', 'Free diapers for Kansas City metro families.', '913-432-3700', 'kansascitydiaperbank.org', 'diapers', 'Kansas City', 'Kansas', 'United States'),
('Kansas Infant-Toddler Services', 'Early intervention services for Kansas children under age 3.', '1-800-332-6262', 'ksits.org', 'early_intervention', NULL, 'Kansas', 'United States'),

-- ══════════ TEXAS ══════════
('Texas WIC', 'Statewide WIC program for Texas families.', '1-800-942-3678', 'texaswic.org', 'wic', NULL, 'Texas', 'United States'),
('Texas Diaper Bank', 'Free diapers for Dallas-area families.', '214-566-8639', 'texasdiaperbank.org', 'diapers', 'Dallas', 'Texas', 'United States'),
('Houston Food Bank', 'Largest food bank in the US, serving 18 SE Texas counties.', '713-223-3700', 'houstonfoodbank.org', 'food_pantry', 'Houston', 'Texas', 'United States'),
('Texas Early Childhood Intervention', 'Free early intervention services for Texas children under age 3.', '512-776-7260', 'hhs.texas.gov', 'early_intervention', NULL, 'Texas', 'United States'),
('DePelchin Children''s Center', 'Family support and parenting services in Houston.', '713-526-4243', 'depelchin.org', 'support', 'Houston', 'Texas', 'United States'),

-- ══════════ OKLAHOMA ══════════
('Oklahoma WIC', 'Statewide WIC program for Oklahoma families.', '405-271-4676', 'oklahoma.gov/health/services/children-family/wic.html', 'wic', NULL, 'Oklahoma', 'United States'),
('Oklahoma Regional Food Bank', 'Food bank serving 53 Oklahoma counties.', '918-585-2800', 'okfoodbank.org', 'food_pantry', 'Tulsa', 'Oklahoma', 'United States'),
('Infant Crisis Services', 'Free diapers and baby supplies for OKC-area families in need.', '405-843-0554', 'infantcrisis.org', 'diapers', 'Oklahoma City', 'Oklahoma', 'United States'),
('Parent Child Center of Tulsa', 'Parenting classes and family support services in Tulsa.', '918-582-1457', 'parentchildcenter.org', 'parenting', 'Tulsa', 'Oklahoma', 'United States'),
('Oklahoma SoonerStart', 'Early intervention services for Oklahoma children under age 3.', '405-521-4880', 'okdhs.org', 'early_intervention', NULL, 'Oklahoma', 'United States'),

-- ══════════ NEW MEXICO ══════════
('New Mexico WIC', 'Statewide WIC program for New Mexico families.', '505-476-8817', 'nmwic.org', 'wic', NULL, 'New Mexico', 'United States'),
('Roadrunner Food Bank', 'Food bank serving Central and Southern New Mexico.', '505-247-2052', 'rrfb.org', 'food_pantry', 'Albuquerque', 'New Mexico', 'United States'),
('Baby Bunny Diaper Bank', 'Free diapers for Albuquerque-area families.', '505-244-9500', 'babybunnynm.org', 'diapers', 'Albuquerque', 'New Mexico', 'United States'),
('NM Early Intervention', 'Early intervention services for New Mexico children under age 3.', '800-552-8195', 'cdd.unm.edu', 'early_intervention', NULL, 'New Mexico', 'United States'),
('Parents Making a Difference NM', 'Parent support group serving San Juan County families.', '505-326-4245', 'pmsnm.org', 'support', NULL, 'New Mexico', 'United States'),

-- ══════════ ARIZONA ══════════
('Arizona WIC', 'Statewide WIC program for Arizona families.', '602-542-8700', 'azdhs.gov/prevention/azwic', 'wic', NULL, 'Arizona', 'United States'),
('St. Mary''s Food Bank', 'World''s first food bank, serving Central Arizona.', '602-528-3434', 'firstfoodbank.org', 'food_pantry', 'Phoenix', 'Arizona', 'United States'),
('Diaper Bank of Southern Arizona', 'Free diapers for Tucson-area families.', '520-325-1400', 'diaperbank.org', 'diapers', 'Tucson', 'Arizona', 'United States'),
('Arizona Early Intervention Program', 'Free early intervention services for AZ children under age 3.', '602-532-9969', 'azdes.gov/azeip', 'early_intervention', NULL, 'Arizona', 'United States'),
('Southwest Human Development', 'Parent support and early childhood services in Phoenix.', '602-244-0089', 'swhd.org', 'support', 'Phoenix', 'Arizona', 'United States'),

-- ══════════ COLORADO ══════════
('Colorado WIC', 'Statewide WIC program for Colorado families.', '303-692-2429', 'coloradowic.gov', 'wic', NULL, 'Colorado', 'United States'),
('Food Bank of the Rockies', 'Food bank serving Metro Denver and 31 Colorado counties.', '720-473-6200', 'foodbankrockies.org', 'food_pantry', 'Denver', 'Colorado', 'United States'),
('WeeCycle Colorado', 'Free diapers and baby essentials for Colorado families in need.', '720-630-9267', 'weecyclecolorado.org', 'diapers', 'Denver', 'Colorado', 'United States'),
('Colorado Early Intervention', 'Free early intervention services for Colorado children under age 3.', '303-866-6694', 'colorado.gov', 'early_intervention', NULL, 'Colorado', 'United States'),
('Colorado Family Resource Centers', 'Parenting classes and family support across Colorado.', '303-321-9365', 'familyresourcecenters.org', 'parenting', 'Denver', 'Colorado', 'United States'),

-- ══════════ UTAH ══════════
('Utah WIC', 'Statewide WIC program for Utah families.', '801-538-6960', 'wic.utah.gov', 'wic', NULL, 'Utah', 'United States'),
('Utah Food Bank', 'Statewide food bank serving Utah communities.', '801-978-2452', 'utahfoodbank.org', 'food_pantry', 'Salt Lake City', 'Utah', 'United States'),
('Youth & Community Connections Diaper Bank', 'Free diapers for Utah families in need.', '801-456-0646', 'yccogden.org', 'diapers', 'Salt Lake City', 'Utah', 'United States'),
('Utah Baby Watch Early Intervention', 'Early intervention services for Utah children under age 3.', '801-584-8226', 'babywatch.utah.gov', 'early_intervention', NULL, 'Utah', 'United States'),
('Family Support Center Utah', 'Parent support and family strengthening services in Utah County.', '801-373-4765', 'familysupportcenter.org', 'support', 'Provo', 'Utah', 'United States'),

-- ══════════ NEVADA ══════════
('Nevada WIC', 'Statewide WIC program for Nevada families.', '702-759-0617', 'nv.gov/wic', 'wic', NULL, 'Nevada', 'United States'),
('Three Square Food Bank', 'Food bank serving Southern Nevada.', '702-644-3663', 'threesquare.org', 'food_pantry', 'Las Vegas', 'Nevada', 'United States'),
('Baby Baskets', 'Free baby supplies and diapers for Reno-area families.', '775-359-4456', 'babybaskets.org', 'diapers', 'Reno', 'Nevada', 'United States'),
('Nevada Project ASSIST', 'Early intervention services for Nevada children under age 3.', '775-684-3462', 'dhhs.nv.gov', 'early_intervention', NULL, 'Nevada', 'United States'),
('The Children''s Cabinet', 'Parenting classes and family support in Northern Nevada.', '775-329-2266', 'thechildrenscabinet.org', 'parenting', 'Reno', 'Nevada', 'United States'),

-- ══════════ CALIFORNIA ══════════
('Public Health Foundation WIC', 'WIC services for Los Angeles County.', '888-942-2229', 'phfewic.org', 'wic', 'Los Angeles', 'California', 'United States'),
('SF-Marin Food Bank', 'Food bank serving San Francisco and Marin County.', '415-282-1900', 'sfmfoodbank.org', 'food_pantry', 'San Francisco', 'California', 'United States'),
('Help a Mother Out', 'Free diapers for Oakland-area families in need.', '510-444-9170', 'helpamotherout.org', 'diapers', 'Oakland', 'California', 'United States'),
('California Early Start', 'Early intervention services for California children under age 3.', '800-515-2229', 'dds.ca.gov/services/early-start', 'early_intervention', NULL, 'California', 'United States'),
('211 LA', 'Connect with local services and support across Los Angeles.', '213-385-5100', '211la.org', 'other', 'Los Angeles', 'California', 'United States'),

-- ══════════ OREGON ══════════
('Oregon WIC', 'Statewide WIC program for Oregon families.', '503-988-4166', 'oregon.gov/oha/PH/HEALTHYPEOPLEFAMILIES/WIC', 'wic', NULL, 'Oregon', 'United States'),
('Oregon Food Bank', 'Statewide food bank serving Oregon and Southwest Washington.', '503-282-0555', 'oregonfoodbank.org', 'food_pantry', 'Portland', 'Oregon', 'United States'),
('PDX Diaper Bank', 'Free diapers for Portland-area families.', '503-517-8112', 'pdxdiaperbank.org', 'diapers', 'Portland', 'Oregon', 'United States'),
('Oregon Early Intervention', 'Free early intervention services for Oregon children under age 3.', '503-947-5780', 'oregon.gov/ode', 'early_intervention', NULL, 'Oregon', 'United States'),
('Parenting Now', 'Parenting classes and education in the Eugene area.', '541-682-3111', 'parentingnow.org', 'parenting', 'Eugene', 'Oregon', 'United States'),

-- ══════════ WASHINGTON ══════════
('Washington State WIC', 'Statewide WIC program for Washington families.', '206-263-9300', 'doh.wa.gov/you-and-your-family/wic', 'wic', NULL, 'Washington', 'United States'),
('Food Lifeline', 'Food bank serving Western Washington.', '206-545-6600', 'foodlifeline.org', 'food_pantry', 'Seattle', 'Washington', 'United States'),
('Westside Baby', 'Free diapers and baby supplies for Pierce County families.', '253-272-8436', 'westsidebaby.org', 'diapers', 'Tacoma', 'Washington', 'United States'),
('Washington ESIT', 'Early intervention services for Washington children under age 3.', '800-322-2588', 'dcyf.wa.gov/services/early-learning-providers/esit', 'early_intervention', NULL, 'Washington', 'United States'),
('STAM Spokane', 'Parent support and family advocacy in Eastern Washington.', '509-327-6860', 'stamspokane.org', 'support', 'Spokane', 'Washington', 'United States'),

-- ══════════ IDAHO ══════════
('Idaho WIC', 'Statewide WIC program for Idaho families.', '208-334-5948', 'healthandwelfare.idaho.gov', 'wic', NULL, 'Idaho', 'United States'),
('Idaho Foodbank', 'Food bank serving the Treasure Valley and statewide.', '208-336-9643', 'idahofoodbank.org', 'food_pantry', 'Boise', 'Idaho', 'United States'),
('Jesse Rees Foundation', 'Baby supplies and diapers for Boise-area families.', '208-344-0858', 'jessealberson.org', 'diapers', 'Boise', 'Idaho', 'United States'),
('Idaho Infant Toddler Program', 'Early intervention services for Idaho children under age 3.', '208-334-0990', 'healthandwelfare.idaho.gov', 'early_intervention', NULL, 'Idaho', 'United States'),
('Family Cornerstone Idaho', 'Parent support and family services in Southern Idaho.', '208-734-4204', 'familycornerstone.org', 'support', NULL, 'Idaho', 'United States'),

-- ══════════ MONTANA ══════════
('Montana WIC', 'Statewide WIC program for Montana families.', '406-444-2841', 'dphhs.mt.gov/publichealth/wic', 'wic', NULL, 'Montana', 'United States'),
('Montana Food Bank Network', 'Statewide food bank network serving Montana communities.', '406-721-3825', 'montanafoodbanknetwork.org', 'food_pantry', 'Missoula', 'Montana', 'United States'),
('Family Service Diaper Bank', 'Free diapers for Billings-area families.', '406-252-8770', 'familycenterbillings.org', 'diapers', 'Billings', 'Montana', 'United States'),
('Montana Early Intervention', 'Early intervention services for Montana children under age 3.', '406-444-5647', 'dphhs.mt.gov', 'early_intervention', NULL, 'Montana', 'United States'),
('Thrive Bozeman Parenting', 'Parenting classes and family support in Bozeman.', '406-586-9091', 'thrivebozeman.org', 'parenting', 'Bozeman', 'Montana', 'United States'),

-- ══════════ WYOMING ══════════
('Wyoming WIC', 'Statewide WIC program for Wyoming families.', '307-777-7496', 'health.wyo.gov/publichealth/wic', 'wic', NULL, 'Wyoming', 'United States'),
('Food Bank of Wyoming', 'Statewide food bank serving Wyoming communities.', '307-265-5209', 'wyomingfoodbank.org', 'food_pantry', 'Casper', 'Wyoming', 'United States'),
('Central Wyoming Diaper Bank', 'Free diapers for Casper-area families.', '307-439-4000', 'centralwydiaperbank.org', 'diapers', 'Casper', 'Wyoming', 'United States'),
('Wyoming Early Intervention', 'Early intervention services for Wyoming children under age 3.', '800-868-5437', 'health.wyo.gov', 'early_intervention', NULL, 'Wyoming', 'United States'),
('Parenting Littles WY', 'Parent support resources in the Laramie area.', '307-721-1820', 'parentinglittles.com', 'support', NULL, 'Wyoming', 'United States'),

-- ══════════ ALASKA ══════════
('Alaska WIC', 'Statewide WIC program for Alaska families.', '907-269-3495', 'health.alaska.gov/en/dph/wic', 'wic', NULL, 'Alaska', 'United States'),
('Food Bank of Alaska', 'Statewide food bank serving Alaska communities.', '907-272-3663', 'foodbankofalaska.org', 'food_pantry', 'Anchorage', 'Alaska', 'United States'),
('Bean''s Café Diaper Program', 'Free diapers and baby supplies for Anchorage families in need.', '907-276-6440', 'beanscafe.org', 'diapers', 'Anchorage', 'Alaska', 'United States'),
('Alaska Infant Learning Program', 'Early intervention services for Alaska children under age 3.', '907-269-3424', 'health.alaska.gov', 'early_intervention', NULL, 'Alaska', 'United States'),
('Cook Inlet Tribal Council Eelaak', 'Parenting support and early childhood programs in Anchorage.', '907-565-1200', 'akeelaak.org', 'parenting', 'Anchorage', 'Alaska', 'United States'),

-- ══════════ HAWAII ══════════
('Hawaii WIC', 'Statewide WIC program for Hawaii families.', '808-586-8175', 'health.hawaii.gov/wic', 'wic', NULL, 'Hawaii', 'United States'),
('Hawaii Foodbank', 'Statewide food bank serving the islands of Hawaii.', '808-836-3600', 'hawaiifoodbank.org', 'food_pantry', 'Honolulu', 'Hawaii', 'United States'),
('Hawaii Diaper Bank', 'Free diapers for Hawaii families in need.', '808-528-7727', 'hawaiidiaperbank.org', 'diapers', 'Honolulu', 'Hawaii', 'United States'),
('Hawaii Early Intervention Services', 'Early intervention services for Hawaii children under age 3.', '808-733-9065', 'hawaiipublicschools.org', 'early_intervention', NULL, 'Hawaii', 'United States'),
('PACT Hawaii', 'Parent support and family advocacy services in Honolulu.', '808-841-2245', 'pacthawaii.org', 'support', 'Honolulu', 'Hawaii', 'United States');

-- ══════════ ALABAMA ══════════
INSERT INTO local_resources (name, description, phone, website, service_type, city, state, country) VALUES
('Alabama WIC Program', 'Formula assistance; breastfeeding support; healthy food benefits; nutrition counseling.', '1-888-942-4673', 'https://www.alabamapublichealth.gov/WIC/', 'wic', NULL, 'Alabama', 'United States'),
('United Way 211 Alabama', 'Emergency food; rent assistance; utility help; diapers; shelters; baby supplies.', '211', 'https://www.211connectsalabama.org/', 'other', NULL, 'Alabama', 'United States'),
('Community Food Bank of Central Alabama', 'Food pantry network; emergency groceries; mobile food distributions.', '(205) 942-8911', 'https://feedingal.org/find-food/', 'food_pantry', 'Birmingham', 'Alabama', 'United States'),
('Bundles of Hope Diaper Bank', 'Free diapers; wipes; infant care items; referrals.', '(205) 607-2112', 'https://www.bundlesofhope-diaperbank.org/', 'diapers', 'Birmingham', 'Alabama', 'United States'),
('Grace Klein Community', 'Food pantry; family support; community meals; emergency aid.', '(205) 490-7516', 'http://www.gracekleincommunity.com', 'support', 'Birmingham', 'Alabama', 'United States'),
('Pregnancy Resource Center Pelham', 'Parenting classes; baby supplies; pregnancy testing.', '(205) 664-1668', 'https://pregnancycenterpelham.org', 'parenting', 'Pelham', 'Alabama', 'United States'),
('Huntsville Pregnancy Resource Center', 'Free baby items; parenting education; pregnancy services.', '(256) 533-3526', 'https://hprc.life/', 'parenting', 'Huntsville', 'Alabama', 'United States'),
('Manna House Huntsville', 'Emergency food; clothing; hygiene items; family aid.', '(256) 536-2982', 'https://www.themannahouse.org/', 'food_pantry', 'Huntsville', 'Alabama', 'United States'),
('Heart of Alabama Food Bank', 'Food pantry network; child nutrition programs; emergency groceries.', '(334) 263-3784', 'https://hafb.org/', 'food_pantry', 'Montgomery', 'Alabama', 'United States'),
('First Choice Women''s Medical Center', 'Parenting resources; baby supplies; pregnancy support.', '(334) 260-8011', 'https://firstchoicemontgomery.org/', 'support', 'Montgomery', 'Alabama', 'United States'),
('Feeding the Gulf Coast', 'Food distribution; school pantry programs; family food assistance.', '(251) 653-1617', 'https://www.feedingthegulfcoast.org/', 'food_pantry', 'Mobile', 'Alabama', 'United States'),
('Prodisee Pantry', 'Emergency groceries; baby food; nutrition programs.', '(251) 626-1720', 'https://prodiseepantry.org/', 'food_pantry', 'Spanish Fort', 'Alabama', 'United States'),
('Tuscaloosa County WIC', 'WIC enrollment; formula; nutrition assistance; breastfeeding support.', '(205) 562-6900', NULL, 'wic', 'Tuscaloosa', 'Alabama', 'United States'),
('West Alabama Food Bank', 'Food pantry network; family food assistance; child hunger programs.', '(205) 333-5353', 'https://westalabamafoodbank.org/', 'food_pantry', 'Tuscaloosa', 'Alabama', 'United States'),
('Food Bank of East Alabama', 'Emergency food; WIC referrals; child nutrition support.', '(334) 821-9006', 'https://foodbankofeastalabama.com/', 'food_pantry', 'Auburn', 'Alabama', 'United States'),
('Alabama SNAP Benefits', 'SNAP / food stamp assistance.', '(334) 242-1700', 'https://dhr.alabama.gov/food-assistance/', 'snap', NULL, 'Alabama', 'United States'),
('Alabama Child Care Assistance', 'Child care financial assistance.', '(866) 528-1694', 'https://dhr.alabama.gov/child-care-subsidy/', 'childcare', NULL, 'Alabama', 'United States'),
('Alabama Medicaid', 'Medicaid for children and moms.', '1-800-362-1504', 'https://medicaid.alabama.gov/', 'other', NULL, 'Alabama', 'United States'),
('Alabama Family Assistance Program', 'Temporary cash assistance for families.', '(334) 242-1310', 'https://dhr.alabama.gov/family-assistance/', 'other', NULL, 'Alabama', 'United States'),
('Penelope House', 'Emergency shelter; domestic violence support; counseling.', '(251) 342-8994', 'https://penelopehouse.org/', 'support', 'Mobile', 'Alabama', 'United States'),
('The Foundry Ministries', 'Shelter; recovery programs; family assistance.', '(205) 424-4673', 'https://foundryministries.com/', 'other', 'Birmingham', 'Alabama', 'United States'),
('Jimmie Hale Mission', 'Emergency shelter; meals; family services.', '(205) 323-5878', 'https://jimmiehalemission.com/', 'other', 'Birmingham', 'Alabama', 'United States'),
('Crisis Services of North Alabama', 'Crisis intervention; shelter referrals; counseling.', '(256) 716-1000', 'https://csna.org/', 'mental_health', 'Huntsville', 'Alabama', 'United States'),
('Family Sunshine Center', 'Domestic violence shelter; counseling; legal advocacy.', '(334) 206-2100', 'https://familysunshine.org/', 'support', 'Montgomery', 'Alabama', 'United States'),
('Temporary Emergency Services', 'Emergency food; utility assistance; rent support.', '(205) 758-5535', 'https://tuscaloosates.org/', 'other', 'Tuscaloosa', 'Alabama', 'United States'),
('Wiregrass Area United Way', '211 referrals; financial assistance; food resources.', '(334) 792-8686', 'https://wiregrassunitedway.org/', 'other', 'Dothan', 'Alabama', 'United States'),
('Community Action Partnership of North Alabama', 'Utility assistance; housing support; Head Start.', '(256) 355-7843', 'https://capna.org/', 'childcare', 'Decatur', 'Alabama', 'United States'),
('United Way of East Central Alabama', 'Community referrals; emergency family assistance.', '(256) 236-8229', 'https://www.uweca.org/', 'other', 'Anniston', 'Alabama', 'United States'),
('Safeplace Inc.', 'Emergency shelter; counseling; legal support.', '(256) 767-3076', 'https://safeplace.org/', 'support', 'Florence', 'Alabama', 'United States'),
('Catholic Center of Concern', 'Food pantry; utility help; emergency aid.', '(256) 546-9271', 'https://www.cccgadsden.org/', 'food_pantry', 'Gadsden', 'Alabama', 'United States'),
('Cahaba Center for Mental Health', 'Mental health services; family counseling.', '(334) 875-2100', 'https://cahabacenter.org/', 'mental_health', 'Selma', 'Alabama', 'United States'),
('East Alabama Mental Health Center', 'Family counseling; crisis services; behavioral health.', '(334) 742-2877', 'https://eamhc.org/', 'mental_health', 'Opelika', 'Alabama', 'United States'),
('Autauga Interfaith Care Center', 'Food pantry; emergency assistance; clothing.', '(334) 365-3677', 'https://aiccalabama.org/', 'food_pantry', 'Prattville', 'Alabama', 'United States');
