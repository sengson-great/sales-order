"use client";
import React, { useState, useEffect } from "react";
import axios from "axios";
import api from "@/api/api";
import { useLanguage } from "@/context/LanguageContext";

type CategoriesProps = {            
  selectedCategory: string;
  onSelect: (category: string) => void;
};

type CategoryData = {
  id: number;
  name: string;
  category_pics?: any;
};

const Categories: React.FC<CategoriesProps> = ({ selectedCategory, onSelect }) => {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const { t } = useLanguage();

  const baseUrl = "https://syspro.asia";

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await api.get<{ status: string; data: CategoryData[] }>("/category/all");
                // Transform data to include full URLs
                const categoriesWithUrls = res.data.data.map(cat => ({
                  id: cat.id,
                  name: cat.name,
                  category_pics: cat.category_pics 
                    ? `${baseUrl}/storage/category-images/${cat.category_pics}`
                    : null
                }));
        setCategories(categoriesWithUrls);
        console.log("Categories with URLs:", categoriesWithUrls);
      } catch (error) {
        console.error("Failed to fetch categories", error);
      }
    }

    fetchCategories();
  }, []);

  const allCategories = [{ id: 0, name: t.all, category_pics: "" }, ...categories];

  return (
    <section className="flex flex-col gap-4 mt-2 mb-1! mr-2">
      {allCategories.map((cat) => (
        <div
          key={cat.id}
          onClick={() => onSelect(cat.name)}
          className={`px-2 py-2 text-[8px] font-medium rounded-[5px] cursor-pointer flex flex-col items-center justify-center min-h-[50px] w-[50px] ${
            selectedCategory === cat.name ? "bg-blue-600 text-white" : "bg-gray-500 text-white"
          }`}
        >
          <span className="pb-0.5">
            {cat.name}
          </span>
          <img src={cat.category_pics}/>
        </div>
      ))}
    </section>
  );
};

export default Categories;
