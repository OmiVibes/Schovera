// M2 interface copy. Evidence, student names and staff reasons remain original.
export const attendanceReviewCopy = String.raw`
Gate and classroom review|गेट और कक्षा की समीक्षा|प्रवेशद्वार आणि वर्ग आढावा
Loading register state…|रजिस्टर की स्थिति लोड हो रही है…|रजिस्टरची स्थिती लोड होत आहे…
Register state unavailable — refresh before saving|रजिस्टर की स्थिति उपलब्ध नहीं — सहेजने से पहले फिर जाँचें|रजिस्टरची स्थिती उपलब्ध नाही — जतन करण्यापूर्वी पुन्हा तपासा
Revision unavailable|संस्करण उपलब्ध नहीं|आवृत्ती उपलब्ध नाही
Historical Teacher-saved record; it predates explicit register finalization.|शिक्षक का पुराना सहेजा रिकॉर्ड; यह स्पष्ट रजिस्टर पुष्टि से पहले का है।|शिक्षकांनी जतन केलेली जुनी नोंद; ती स्पष्ट रजिस्टर पुष्टीपूर्वीची आहे.
Historical reference-only events may appear here. Classroom review uses assignment-bound v2 evidence only. Names and classes are stored bindings, not verified identity at scan time.|यहाँ पुराने केवल-संदर्भ रिकॉर्ड हो सकते हैं। कक्षा समीक्षा केवल आवंटन-बद्ध v2 रिकॉर्ड लेती है। नाम और कक्षाएँ सहेजे संबंध हैं, स्कैन के समय सत्यापित पहचान नहीं।|येथे जुन्या केवळ-संदर्भ नोंदी असू शकतात. वर्ग आढाव्यात फक्त नेमणुकीशी बांधलेले v2 पुरावे वापरले जातात. नावे आणि वर्ग हे जतन केलेले संबंध आहेत, स्कॅनवेळची सत्यापित ओळख नाही.
Include reviewed evidence|समीक्षा किए रिकॉर्ड भी दिखाएँ|आढावा घेतलेले पुरावेही दाखवा
Showing {0} of {1} matching exception students.|मिलान वाले {1} अपवाद विद्यार्थियों में से {0} दिखाए हैं।|जुळणाऱ्या {1} अपवाद विद्यार्थ्यांपैकी {0} दाखवले आहेत.
Show more exceptions|और अपवाद दिखाएँ|आणखी अपवाद दाखवा
Saved records only. Scans never confirm classroom presence or safety.|केवल सहेजे रिकॉर्ड। स्कैन कक्षा में उपस्थिति या सुरक्षा की पुष्टि नहीं करते।|फक्त जतन केलेल्या नोंदी. स्कॅन वर्गातील उपस्थिती किंवा सुरक्षिततेची पुष्टी करत नाहीत.
Compared with the current class roster, not the class at scan time. Missing events may reflect a card, reader, clock or sync issue.|तुलना वर्तमान कक्षा सूची से है, स्कैन के समय की कक्षा से नहीं। रिकॉर्ड न होने का कारण कार्ड, रीडर, घड़ी या सिंक हो सकता है।|तुलना सध्याच्या वर्गयादीशी आहे, स्कॅनवेळच्या वर्गाशी नाही. नोंद नसण्याचे कारण कार्ड, रीडर, घड्याळ किंवा सिंक असू शकते.
Refresh evidence|रिकॉर्ड फिर जाँचें|पुरावे पुन्हा तपासा
Checking saved attendance evidence…|सहेजे उपस्थिति रिकॉर्ड जाँचे जा रहे हैं…|जतन केलेल्या उपस्थितीच्या नोंदी तपासत आहोत…
Attendance evidence could not be checked. Refresh when connected.|उपस्थिति रिकॉर्ड नहीं जाँचे जा सके। कनेक्ट होने पर फिर जाँचें।|उपस्थितीचे पुरावे तपासता आले नाहीत. जोडणी झाल्यावर पुन्हा तपासा.
Last confirmed by {0}|पिछली पुष्टि: {0}|शेवटची पुष्टी: {0}
{0} students need review; {1} reviewed for this evidence.|{0} विद्यार्थियों की समीक्षा बाकी; इन रिकॉर्ड के लिए {1} की समीक्षा हुई।|{0} विद्यार्थ्यांचा आढावा बाकी; या पुराव्यांसाठी {1} जणांचा आढावा झाला.
No exception under these rules. This does not certify identity, safety or complete reader coverage.|इन नियमों के अनुसार कोई अपवाद नहीं। इससे पहचान, सुरक्षा या सभी स्कैन की पुष्टि नहीं होती।|या नियमांनुसार अपवाद नाही. यामुळे ओळख, सुरक्षितता किंवा सर्व स्कॅनची हमी मिळत नाही.
Needs review|समीक्षा आवश्यक|आढावा आवश्यक
Reviewed evidence|रिकॉर्ड की समीक्षा हुई|पुराव्यांचा आढावा झाला
No matching gate entry — manual attendance remains valid|गेट प्रवेश का मिलान नहीं — शिक्षक की उपस्थिति मान्य है|प्रवेशद्वाराची जुळणारी नोंद नाही — शिक्षकांची उपस्थिती नोंद वैध आहे
Gate evidence recorded; classroom attendance is not confirmed|गेट का रिकॉर्ड है; कक्षा की उपस्थिति की पुष्टि नहीं हुई|प्रवेशद्वाराची नोंद आहे; वर्गातील उपस्थितीची पुष्टी नाही
Gate evidence and saved Absent mark need review|गेट रिकॉर्ड और सहेजे अनुपस्थित चिह्न की समीक्षा आवश्यक|प्रवेशद्वाराची नोंद आणि जतन केलेली अनुपस्थिती तपासा
Multiple separate check-in events — not a replay count|प्रवेश की कई अलग घटनाएँ — दोबारा भेजे एक रिकॉर्ड की गिनती नहीं|प्रवेशाच्या अनेक स्वतंत्र नोंदी — एकच नोंद पुन्हा पाठवल्याची मोजणी नाही
Reported scan time is uncertain|दर्ज स्कैन समय अनिश्चित है|नोंदवलेली स्कॅन वेळ अनिश्चित आहे
Scan and receipt differ by over 10 minutes; delay or clock mismatch|स्कैन और प्राप्ति में 10 मिनट से अधिक अंतर; देरी या घड़ी का अंतर संभव|स्कॅन आणि प्राप्तीत 10 मिनिटांपेक्षा जास्त फरक; विलंब किंवा घड्याळातील फरक शक्य
Reader sequence gap or out-of-order evidence|रीडर क्रम में अंतर या रिकॉर्ड गलत क्रम में|रीडर क्रमात अंतर किंवा नोंदींचा क्रम वेगळा
{0} separate gate events; {1} time-matching check-ins for this date.|गेट की {0} अलग घटनाएँ; इस तारीख के {1} समय-संगत प्रवेश रिकॉर्ड।|प्रवेशद्वाराच्या {0} स्वतंत्र नोंदी; या तारखेसाठी {1} वेळ-सुसंगत प्रवेश नोंदी.
Reported scan (UTC): {0}; server receipt (UTC): {1}|दर्ज स्कैन (UTC): {0}; सर्वर प्राप्ति (UTC): {1}|नोंदवलेला स्कॅन (UTC): {0}; सर्वरवर प्राप्ती (UTC): {1}
Find in register|रजिस्टर में खोजें|रजिस्टरमध्ये शोधा
Review without changing attendance|उपस्थिति बदले बिना समीक्षा करें|उपस्थिती न बदलता आढावा घ्या
Reviewed by {0}|समीक्षा की: {0}|आढावा घेतला: {0}
School staff|स्कूल कर्मचारी|शाळेचे कर्मचारी
What did you check?|आपने क्या जाँचा?|तुम्ही काय तपासले?
Use at least 8 characters and two words. Say what you checked or why the mark changed.|कम से कम 8 अक्षर और दो शब्द लिखें। क्या जाँचा या चिह्न क्यों बदला, बताएँ।|किमान 8 अक्षरे आणि दोन शब्द लिहा. काय तपासले किंवा नोंद का बदलली ते सांगा.
Record staff review|कर्मचारी समीक्षा सहेजें|कर्मचाऱ्यांचा आढावा जतन करा
Cancel review|समीक्षा रद्द करें|आढावा रद्द करा
Evidence changed. Refresh and review again.|रिकॉर्ड बदल गए। फिर जाँचकर समीक्षा करें।|पुरावे बदलले आहेत. पुन्हा तपासून आढावा घ्या.
Review was not confirmed. Check your permission and retry the same review.|समीक्षा की पुष्टि नहीं हुई। अनुमति जाँचें और वही समीक्षा फिर भेजें।|आढाव्याची पुष्टी झाली नाही. परवानगी तपासा आणि तोच आढावा पुन्हा पाठवा.
Review recorded. Classroom attendance was not changed.|समीक्षा सहेजी गई। कक्षा की उपस्थिति नहीं बदली।|आढावा जतन झाला. वर्गातील उपस्थिती बदलली नाही.
Legacy reference-only gate events are excluded from named reconciliation.|पुराने केवल-संदर्भ गेट रिकॉर्ड नाम-आधारित मिलान में शामिल नहीं हैं।|जुन्या केवळ-संदर्भ प्रवेश नोंदी नावानुसार जुळवणीत समाविष्ट नाहीत.
Today’s classroom confirmation is unavailable. Earlier saved history is shown separately.|आज की कक्षा पुष्टि उपलब्ध नहीं है। पुराना सहेजा इतिहास अलग दिखाया गया है।|आजची वर्गातील पुष्टी उपलब्ध नाही. पूर्वीचा जतन केलेला इतिहास वेगळा दाखवला आहे.
Checking today’s classroom confirmation…|आज की कक्षा पुष्टि जाँची जा रही है…|आजची वर्गातील पुष्टी तपासत आहोत…
Current class: Teacher-saved attendance is available for {0}.|वर्तमान कक्षा: {0} के लिए शिक्षक द्वारा सहेजी उपस्थिति उपलब्ध है।|सध्याचा वर्ग: {0} साठी शिक्षकांनी जतन केलेली उपस्थिती उपलब्ध आहे.
No Teacher-confirmed record for the current class is available for {0}. Missing gate evidence is not an absence.|{0} के लिए वर्तमान कक्षा का शिक्षक-पुष्ट रिकॉर्ड उपलब्ध नहीं है। गेट रिकॉर्ड न होना अनुपस्थिति नहीं है।|{0} साठी सध्याच्या वर्गाची शिक्षकांनी पुष्टी केलेली नोंद उपलब्ध नाही. प्रवेश नोंद नसणे म्हणजे अनुपस्थिती नाही.
Classroom attendance overview|कक्षा उपस्थिति का अवलोकन|वर्ग उपस्थितीचा आढावा
Review date|समीक्षा तारीख|आढाव्याची तारीख
Refresh attendance|उपस्थिति फिर जाँचें|उपस्थिती पुन्हा तपासा
Finalized registers|पुष्टि किए रजिस्टर|पुष्टी केलेली रजिस्टर
Not finalized|पुष्टि बाकी|पुष्टी बाकी
{0} of {1} current students have saved classroom records.|वर्तमान {1} विद्यार्थियों में से {0} के कक्षा रिकॉर्ड सहेजे हैं।|सध्याच्या {1} विद्यार्थ्यांपैकी {0} जणांच्या वर्ग नोंदी जतन आहेत.
{0} students have unresolved review flags; {1} legacy saved registers.|{0} विद्यार्थियों की समीक्षा बाकी; {1} पुराने सहेजे रजिस्टर।|{0} विद्यार्थ्यांचा आढावा बाकी; {1} जुनी जतन केलेली रजिस्टर.
{0} unresolved card receipts received on this date. Identity and class are not established.|इस तारीख को कार्ड के {0} अनसुलझे रिकॉर्ड मिले। पहचान और कक्षा निश्चित नहीं हैं।|या तारखेला कार्डच्या {0} अनिर्णित नोंदी मिळाल्या. ओळख आणि वर्ग निश्चित नाहीत.
Unknown, inactive, unassigned or ambiguous card receipts cannot be attached to a named class from this evidence.|अज्ञात, निष्क्रिय, बिना आवंटन या अस्पष्ट कार्ड रिकॉर्ड को इस प्रमाण से किसी कक्षा से नहीं जोड़ा जा सकता।|अज्ञात, निष्क्रिय, न नेमलेल्या किंवा संदिग्ध कार्ड नोंदी या पुराव्यावरून एखाद्या वर्गाशी जोडता येत नाहीत.
Finalized|पुष्टि की गई|पुष्टी झाली
Draft|प्रारूप|मसुदा
Legacy saved|पुराना सहेजा रिकॉर्ड|जुनी जतन केलेली नोंद
Unmarked|चिह्नित नहीं|नोंद केलेली नाही
{0} need review|{0} की समीक्षा बाकी|{0} आढावे बाकी
Showing {0} classes on this page; {1} active classes in total.|इस पृष्ठ पर {0} कक्षाएँ; कुल {1} सक्रिय कक्षाएँ।|या पानावर {0} वर्ग; एकूण {1} सक्रिय वर्ग.
First classes|पहली कक्षाएँ|पहिले वर्ग
More classes|और कक्षाएँ|आणखी वर्ग
Class exception review|कक्षा अपवाद समीक्षा|वर्गातील अपवादांचा आढावा
Choose a class to review|समीक्षा के लिए कक्षा चुनें|आढाव्यासाठी वर्ग निवडा
Discard unsaved attendance changes?|बिना सहेजे उपस्थिति बदलाव हटाएँ?|न जतन केलेले उपस्थितीचे बदल रद्द करायचे?
Conflict — held work needs review|टकराव — रोके काम की समीक्षा आवश्यक|विसंगती — राखलेल्या कामाचा आढावा आवश्यक
Pending offline sync — Parent records are unchanged|ऑफ़लाइन सिंक बाकी — अभिभावक रिकॉर्ड नहीं बदले|ऑफलाइन सिंक बाकी — पालकांच्या नोंदी बदललेल्या नाहीत
Teacher: {0}|शिक्षक: {0}|शिक्षक: {0}
Mark all Present (unsaved)|सभी को उपस्थित चिह्नित करें (बिना सहेजे)|सर्वांना उपस्थित नोंदवा (अद्याप जतन नाही)
Bulk edits remain unsaved until you explicitly save or finalize.|सभी बदलाव आपके सहेजने या पुष्टि करने तक सहेजे नहीं जाते।|तुम्ही स्पष्टपणे जतन किंवा पुष्टी करेपर्यंत सामूहिक बदल जतन होत नाहीत.
Held offline work|रोका गया ऑफ़लाइन काम|राखलेले ऑफलाइन काम
Original intentions are retained. Nothing here forces a stale save or changes its original envelope.|मूल बदलाव सुरक्षित हैं। यहाँ पुराने बदलाव जबरन लागू नहीं होते और उनका मूल स्वरूप नहीं बदलता।|मूळ बदल जतन आहेत. येथे जुने बदल सक्तीने लागू होत नाहीत किंवा त्यांचे मूळ स्वरूप बदलत नाही.
Classroom register|कक्षा रजिस्टर|वर्ग रजिस्टर
Important student update|विद्यार्थी का महत्वपूर्ण संदेश|विद्यार्थ्याचा महत्त्वाचा संदेश
Operation {0}|कार्य {0}|कार्य {0}
Class reference {0}|कक्षा संदर्भ {0}|वर्ग संदर्भ {0}
A newer register exists. Reload it, compare the retained intention with school staff, then make a new correction with its current revision and a reason.|नया रजिस्टर मौजूद है। फिर खोलें, स्कूल कर्मचारी के साथ सुरक्षित बदलाव की तुलना करें, फिर वर्तमान संस्करण और कारण से नया सुधार करें।|नवे रजिस्टर आहे. ते पुन्हा उघडा, शाळेच्या कर्मचाऱ्यांसह राखलेल्या बदलाची तुलना करा, मग सध्याच्या आवृत्तीवर कारणासह नवी दुरुस्ती करा.
This older intention needs a reviewed new correction. Ask school staff to inspect the retained operation; its original envelope must not be edited.|पुराने बदलाव के लिए समीक्षा के बाद नया सुधार आवश्यक है। कर्मचारी से सुरक्षित कार्य जाँचने को कहें; उसका मूल स्वरूप न बदलें।|जुन्या बदलासाठी आढाव्यानंतर नवी दुरुस्ती आवश्यक आहे. कर्मचाऱ्यांना राखलेले कार्य तपासायला सांगा; त्याचे मूळ स्वरूप बदलू नका.
Current permission was refused. Ask the school administrator to check the assignment or account before creating any new write.|वर्तमान अनुमति नहीं मिली। नया बदलाव करने से पहले प्रशासक से कक्षा आवंटन या खाता जाँचने को कहें।|सध्याची परवानगी नाकारली गेली. नवा बदल करण्यापूर्वी प्रशासकांना वर्ग नेमणूक किंवा खाते तपासायला सांगा.
Saved work is retained. Ask school staff to inspect this operation before retrying or making a new write. Retry cannot force a conflict.|सहेजा काम सुरक्षित है। फिर भेजने या नया बदलाव करने से पहले कर्मचारी से यह कार्य जँचवाएँ। फिर भेजना टकराव को जबरन लागू नहीं करता।|जतन केलेले काम राखले आहे. पुन्हा पाठवण्यापूर्वी किंवा नवा बदल करण्यापूर्वी कर्मचाऱ्यांकडून हे कार्य तपासून घ्या. पुन्हा पाठवल्याने विसंगत बदल सक्तीने लागू होत नाही.
`;
