import * as React from "react";
import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type FaqQuestion = {
  question: string;
  answer: string;
};

type FaqCategory = {
  title: string;
  questions: FaqQuestion[];
};

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    title: "KYC (Know Your Customer)",
    questions: [
      {
        question: "Why is KYC required on Gfolio?",
        answer:
          "KYC is mandatory to comply with financial regulations and ensure secure transactions. It helps verify your identity, prevents fraud, and enables seamless buying, selling, and gifting of digital assets.",
      },
      {
        question: "What documents are required for KYC?",
        answer:
          "Typically, you will need a government-issued ID, such as Aadhaar or PAN, along with basic personal details.",
      },
      {
        question: "Is my KYC data safe and private?",
        answer:
          "Yes. Gfolio uses industry-grade encryption and secure storage practices. Your data is stored in compliance with regulatory standards and is never shared without consent.",
      },
      {
        question: "Where is my data stored?",
        answer:
          "Your data is stored on secure, compliant servers with strict access controls and encryption protocols to ensure maximum protection.",
      },
      {
        question: "How long does KYC verification take?",
        answer:
          "KYC verification is usually completed in four hours, but in some cases, it may take up to 24 hours depending on verification checks.",
      },
    ],
  },
  {
    title: "Digital Gold",
    questions: [
      {
        question: "What is Digital Gold on Gfolio?",
        answer:
          "Digital Gold allows you to buy, sell, and hold gold online in small quantities without the need for physical storage.",
      },
      {
        question: "Is Digital Gold safe?",
        answer:
          "Yes. Your gold is backed by physical gold stored in secure vaults managed by trusted partners like Augmont, ensuring transparency and safety.",
      },
      {
        question: "Can I convert Digital Gold into physical gold?",
        answer:
          "Yes, you can request delivery of physical gold, such as coins or bars, based on available options.",
      },
      {
        question: "Is there any storage cost?",
        answer:
          "Typically, storage is free up to a certain period, after which minimal charges may apply depending on the provider.",
      },
      {
        question: "What is the purity of the gold?",
        answer:
          "Digital Gold on Gfolio is usually 24K with 99.9% purity, ensuring high-quality investment.",
      },
    ],
  },
  {
    title: "Buy and Sell Gold",
    questions: [
      {
        question: "How is the price of gold determined?",
        answer:
          "Gold prices on Gfolio are dynamically updated in real time based on market rates, ensuring fair and transparent pricing.",
      },
      {
        question: "Can I buy gold anytime?",
        answer: "Yes, you can buy gold 24/7 at live market prices.",
      },
      {
        question: "Is there a minimum investment amount?",
        answer:
          "Yes, you can start with very small amounts, making it accessible for all investors.",
      },
      {
        question: "How quickly can I sell my gold?",
        answer:
          "You can sell your gold instantly, and the amount is credited to your wallet or bank account as per processing timelines.",
      },
      {
        question: "Where is my gold held after purchase?",
        answer:
          "Your gold is securely held in insured vaults on your behalf, eliminating storage risks.",
      },
    ],
  },
  {
    title: "SIP (Systematic Investment Plan in Gold)",
    questions: [
      {
        question: "What is a Gold SIP?",
        answer:
          "A Gold SIP allows you to invest a fixed amount regularly, helping you accumulate gold over time.",
      },
      {
        question: "Why should I invest through SIP?",
        answer:
          "SIP promotes disciplined investing and helps average out price fluctuations, making it ideal for long-term wealth creation.",
      },
      {
        question: "Can I increase or modify my SIP amount?",
        answer:
          "Yes, you can adjust your SIP amount or frequency anytime based on your financial goals.",
      },
      {
        question: "What happens if I miss a SIP payment?",
        answer:
          "Missing a payment does not cancel your SIP. You can resume contributions anytime.",
      },
      {
        question: "Is SIP suitable for long-term growth?",
        answer:
          "Yes. SIP is designed to build wealth gradually and is especially effective for long-term financial planning.",
      },
    ],
  },
  {
    title: "Gift Gold",
    questions: [
      {
        question: "How does gifting gold work on Gfolio?",
        answer:
          "You can purchase digital gold and send it instantly to a recipient via Gfolio using their mobile number or email.",
      },
      {
        question: "Does the recipient need a Gfolio account?",
        answer:
          "The recipient can claim the gift by signing up on Gfolio, making the process seamless.",
      },
      {
        question: "Can I gift gold for special occasions?",
        answer:
          "Yes, Gfolio allows gifting for birthdays, weddings, festivals, and corporate rewards.",
      },
      {
        question: "Is there a minimum or maximum gift amount?",
        answer:
          "You can gift gold in flexible amounts, starting from very small values to high-value transfers.",
      },
      {
        question: "Can the recipient redeem or sell the gifted gold?",
        answer:
          "Yes, once received, the gold becomes part of the recipient's holdings and can be sold, held, or converted into physical gold.",
      },
    ],
  },
];

function QuestionItem({
  question,
  answer,
  index,
}: FaqQuestion & { index: number }) {
  return (
    <AccordionItem
      value={`question-${index}`}
      className="overflow-hidden rounded-lg border bg-white"
    >
      <AccordionTrigger className="group px-3 py-3 text-left hover:no-underline sm:px-4 [&>svg]:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/5 text-xs font-bold text-primary sm:h-9 sm:w-9">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 text-sm font-semibold leading-snug text-foreground">
            {question}
          </span>
        </div>
        <span className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white text-primary transition-colors group-data-[state=open]:bg-primary group-data-[state=open]:text-white">
          <Plus className="h-4 w-4 group-data-[state=open]:hidden" />
          <Minus
            className="hidden h-4 w-4 group-data-[state=open]:block"
            style={{ color: "#ffffff", stroke: "#ffffff" }}
          />
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3 pt-0 sm:px-4">
        <div className="ml-11 border-t border-border pt-3 text-sm leading-6 text-muted-foreground sm:ml-12">
          {answer}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function CategoryItem({
  category,
  index,
  openCategory,
}: {
  category: FaqCategory;
  index: number;
  openCategory?: string;
}) {
  const value = `category-${index}`;
  const isOpen = openCategory === value;

  return (
    <AccordionItem
      value={value}
      className={cn(
        "rounded-xl border bg-white/80 px-3 py-1 shadow-sm transition-colors sm:px-4",
        isOpen && "border-primary/20 bg-primary/[0.03]",
      )}
    >
      <AccordionTrigger className="py-3 text-left hover:no-underline [&>svg]:hidden">
        <span className="text-base font-bold text-foreground">{category.title}</span>
        <span
          className={cn(
            "ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
            isOpen
              ? "border-primary bg-primary"
              : "border-gray-300 bg-white text-primary",
          )}
        >
          {isOpen ? (
            <ChevronUp
              className="h-4 w-4"
              style={{ color: "#ffffff", stroke: "#ffffff" }}
            />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-2 pt-1">
        <Accordion type="single" collapsible className="space-y-2.5">
          {category.questions.map((item, questionIndex) => (
            <QuestionItem
              key={item.question}
              index={questionIndex}
              question={item.question}
              answer={item.answer}
            />
          ))}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function FaqQuestions() {
  const [openCategory, setOpenCategory] = React.useState<string>("category-0");

  return (
    <Layout title="FAQ ">
      <Card className="mx-auto w-full max-w-[1046px]">
        <CardHeader className="px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg">Frequently Asked Questions (FAQs)</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
          <Accordion
            type="single"
            collapsible
            value={openCategory}
            onValueChange={setOpenCategory}
            className="space-y-3"
          >
            {FAQ_CATEGORIES.map((category, index) => (
              <CategoryItem
                key={category.title}
                category={category}
                index={index}
                openCategory={openCategory}
              />
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </Layout>
  );
}
