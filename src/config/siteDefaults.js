// Public homepage-er default content. Admin "ইউপি সেটিংস" theke save korle oi data ei default-er upor boshe.
// (Frontend-er src/config/homeContent.js ei file-er hubohu copy; API na pele oita fallback hisabe use hoy.)

export const ICON_KEYS = [
  'Landmark', 'MapPinned', 'ScrollText', 'Store', 'Wheat', 'FileText', 'Home', 'Banknote', 'Droplets',
  'GraduationCap', 'Sprout', 'HeartHandshake', 'Building2', 'School', 'Stethoscope', 'Hospital', 'Mail',
  'Waves', 'Fish', 'Route', 'BookOpen', 'Users', 'Laptop', 'HardHat', 'ShieldCheck',
];

export const SITE_DEFAULTS = {
  unionName: '৫নং বাহিরদিয়া মানসা ইউনিয়ন পরিষদ',
  heroEyebrow: 'ডিজিটাল ইউনিয়ন পরিষদ',
  tagline: 'ডিজিটাল নাগরিক সেবা, স্বচ্ছতা ও জবাবদিহিতা নিশ্চিতকরণে আমরা অঙ্গীকারবদ্ধ।',

  notices: [
    'ডিজিটাল ইউনিয়ন পরিষদ ওয়েবসাইটে আপনাকে স্বাগতম!',
    'অনলাইনে হোল্ডিং ট্যাক্স ও নাগরিক সেবার তথ্য সহজে যাচাই করুন।',
  ],

  contact: { email: 'bahirdiamansa.up@gmail.com', phone: '', address: '' },

  established: '০২/০৭/২০০৫',
  area: '১৬.৮৪ বর্গ কিঃমিঃ',

  chairman: {
    name: 'ইমরুল কায়েস',
    designation: 'প্রশাসক',
    title: 'সম্মানিত চেয়ারম্যান',
    photo: '',
    lead: 'হৃদয়ের গভীর থেকে জানাই বৃষ্টিভেজা ভোরের স্নিগ্ধ ভালোবাসা ও পরম কল্যাণের শুভকামনা।',
    message: [
      'ডিজিটাল ইউনিয়ন পরিষদ আমাদের অঙ্গীকার — প্রতিটি নাগরিকের দোরগোড়ায় দ্রুত, স্বচ্ছ ও সহজ সেবা পৌঁছে দেওয়া। এই ওয়েবসাইটের মাধ্যমে আপনি ইউনিয়নের তথ্য, সেবা ও উন্নয়ন কার্যক্রম সম্পর্কে জানতে পারবেন।',
      'আপনাদের সহযোগিতা ও পরামর্শই আমাদের পথচলার শক্তি। আসুন, সবাই মিলে গড়ে তুলি একটি সমৃদ্ধ ও আধুনিক ইউনিয়ন।',
    ],
  },

  history: {
    text: 'এই ইউনিয়নের গৌরবময় ইতিহাস ও ঐতিহ্যবাহী স্থানসমূহের বিবরণ এখানে প্রকাশ করা হবে। ইউনিয়ন পরিষদ ২০০৫ সালে প্রতিষ্ঠিত হওয়ার পর থেকে স্থানীয় সরকারের সেবা মানুষের কাছে পৌঁছে দিচ্ছে।',
    timeline: [
      { year: '২০০৫', text: 'ইউনিয়ন পরিষদ প্রতিষ্ঠা (০২/০৭/২০০৫)' },
      { year: '২০২৬', text: 'ডিজিটাল ইউনিয়ন পরিষদ সেবা ও অনলাইন তথ্যভান্ডার চালু' },
    ],
  },

  geo: {
    text: 'নদী ও জলাশয়ঘেরা সবুজ এই জনপদের ভৌগোলিক সীমানা, নদীনালা এবং প্রধান অর্থনৈতিক খাতের বিবরণ এখানে প্রকাশ করা হবে।',
    sectors: [
      { icon: 'Wheat', label: 'কৃষি' },
      { icon: 'Fish', label: 'মৎস্য' },
      { icon: 'Store', label: 'ক্ষুদ্র ব্যবসা' },
      { icon: 'Waves', label: 'নদী ও জলাশয়' },
    ],
  },

  // হেডারের "সেবা সমূহ" ড্রপডাউন। url ফাঁকা থাকলে ক্লিকে "শীঘ্রই আসছে" দেখায়।
  serviceMenu: [
    { label: 'নাগরিক সনদপত্র', url: '' },
    { label: 'কৃষি সনদপত্র', url: '' },
    { label: 'ওয়ারিশ সনদপত্র', url: '' },
    { label: 'ট্রেড লাইসেন্স', url: '' },
  ],

  services: [
    { icon: 'FileText', title: 'নাগরিক সনদ', text: 'নাগরিকত্ব ও চারিত্রিক সনদের জন্য অনলাইনে আবেদন।' },
    { icon: 'Store', title: 'ট্রেড লাইসেন্স', text: 'নতুন ও নবায়ন — ব্যবসা পরিচালনার বৈধ অনুমোদন।' },
    { icon: 'ScrollText', title: 'ওয়ারিশ সনদ', text: 'উত্তরাধিকার প্রমাণে ওয়ারিশ সনদের আবেদন।' },
    { icon: 'Wheat', title: 'কৃষি সনদ', text: 'কৃষি সংক্রান্ত সুবিধা ও সহায়তার জন্য সনদ।' },
    { icon: 'Home', title: 'ডিজিটাল হোল্ডিং নম্বর', text: 'প্রতিটি বাড়ির জন্য স্বতন্ত্র ডিজিটাল হোল্ডিং নম্বর।' },
    { icon: 'Banknote', title: 'হোল্ডিং ট্যাক্স', text: 'বকেয়া যাচাই ও সহজে ট্যাক্স পরিশোধের তথ্য।' },
  ],

  // সনদ/প্রত্যয়নপত্রের তথ্য। {name} = আবেদনকারীর নাম। verifyUrl ফাঁকা থাকলে এই সাইটের ঠিকানা বসবে।
  certificate: {
    upazila: 'ফকিরহাট',
    district: 'বাগেরহাট',
    unionShort: 'বাহিরদিয়া-মানসা',
    website: 'bahirdiamansa.upsheba.com',
    verifyUrl: '',
    statement: 'উক্ত {name} একজন কৃষিশিল্পী/কৃষক। ইহা আমার জানা মতে সত্য।',
    slogan: 'স্মার্ট ফকিরহাট বিনির্মাণে আপনার সহযোগিতা একান্ত কাম্য',
    credit: '',
  },

  projectsNote: 'ইউনিয়নের উন্নয়নমূলক কাজের বিবরণ ও অগ্রগতি শীঘ্রই এখানে প্রকাশিত হবে।',
  projects: [
    { icon: 'Route', title: 'রাস্তা ও অবকাঠামো' },
    { icon: 'Droplets', title: 'সুপেয় পানি ও স্যানিটেশন' },
    { icon: 'GraduationCap', title: 'শিক্ষা ও শিশু উন্নয়ন' },
    { icon: 'Sprout', title: 'কৃষি ও মৎস্য সহায়তা' },
    { icon: 'HeartHandshake', title: 'সামাজিক নিরাপত্তা' },
  ],

  entrepreneur: {
    text: 'ইউনিয়ন ডিজিটাল সেন্টারের উদ্যোক্তাদের মাধ্যমে নাগরিকরা সহজেই সেবার আবেদন ও তথ্য সহায়তা পান।',
    helps: ['অনলাইন আবেদন সহায়তা', 'প্রিন্ট ও স্ক্যান', 'ইন্টারনেট সেবা', 'তথ্য ও পরামর্শ'],
    note: 'উদ্যোক্তাদের তথ্য ও যোগাযোগ নম্বর শীঘ্রই যুক্ত করা হবে।',
  },

  // ক্লিক করলে url নতুন ট্যাবে খোলে
  offices: [
    { icon: 'Building2', label: 'ইউনিয়ন ভূমি অফিস', url: '' },
    { icon: 'Stethoscope', label: 'উপ-স্বাস্থ্য কেন্দ্র', url: '' },
    { icon: 'Hospital', label: 'কমিউনিটি ক্লিনিক', url: '' },
    { icon: 'Mail', label: 'ডাকঘর', url: '' },
    { icon: 'Sprout', label: 'কৃষি সম্প্রসারণ অফিস', url: '' },
  ],

  // ক্লিক করলে মডাল খোলে: "এই ইউনিয়নে মোট N টি ... আছে"
  institutions: [
    { icon: 'School', label: 'স্কুল', count: null, names: [] },
    { icon: 'GraduationCap', label: 'কলেজ', count: null, names: [] },
    { icon: 'Landmark', label: 'মাদ্রাসা', count: null, names: [] },
    { icon: 'BookOpen', label: 'মক্তব ও এতিমখানা', count: null, names: [] },
  ],
};
