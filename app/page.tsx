"use client";

import SearchBar from "@/components/SearchBar";
import Categories from "@/components/Categories";
import Products from "@/components/Products";
import RewardSection from "./components/RewardSection";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import api from "@/api/api";
import { useLanguage } from "@/context/LanguageContext";

interface ProductData {
  id: number;
  is_active: number;
  product_id: number;
  product: {
    category_name: string;
    id: number;
    name: string;
    price: string | number | null;
    image_url?: string;
  };
}

interface CategoryData {
  id: number;
  name: string;
}

// Cache keys
const PRODUCTS_CACHE_KEY = 'cached_products';
const CATEGORIES_CACHE_KEY = 'cached_categories';
const CACHE_TIMESTAMP_KEY = 'products_cache_timestamp';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour cache expiry

export default function ProductPage() {
  const { t } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>(t.all);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [allProducts, setAllProducts] = useState<ProductData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUsingCache, setIsUsingCache] = useState(false);
  
  // Refs to track state
  const hasInitialized = useRef(false);
  const isFetching = useRef(false);
  
  // Cache for category-specific products
  const [categoryCache, setCategoryCache] = useState<Record<string, ProductData[]>>({});

  // Save products to localStorage
  const saveProductsToCache = (products: ProductData[]) => {
    try {
      if (products.length > 0) {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        console.log('Products saved to cache:', products.length);
      }
    } catch (error) {
      console.error('Failed to save products to cache:', error);
    }
  };

  // Load products from localStorage
  const loadProductsFromCache = (): ProductData[] | null => {
    try {
      const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
      const cacheTime = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      
      if (cached && cacheTime) {
        const timeDiff = Date.now() - parseInt(cacheTime);
        if (timeDiff < CACHE_EXPIRY_MS) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log('Loading products from cache:', parsed.length);
            return parsed;
          }
        }
      }
    } catch (error) {
      console.error('Failed to load products from cache:', error);
    }
    return null;
  };

  // Save categories to localStorage
  const saveCategoriesToCache = (categoriesData: CategoryData[]) => {
    try {
      if (categoriesData.length > 0) {
        localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(categoriesData));
      }
    } catch (error) {
      console.error('Failed to save categories to cache:', error);
    }
  };

  // Load categories from localStorage
  const loadCategoriesFromCache = (): CategoryData[] | null => {
    try {
      const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load categories from cache:', error);
    }
    return null;
  };

  // Clear cache
  const clearCache = () => {
    try {
      localStorage.removeItem(PRODUCTS_CACHE_KEY);
      localStorage.removeItem(CATEGORIES_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      setCategoryCache({});
      setIsUsingCache(false);
      console.log('Cache cleared');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  // Fetch categories on mount with cache support
  useEffect(() => {
    async function fetchCategories() {
      try {
        // Try to load from cache first
        const cachedCategories = loadCategoriesFromCache();
        if (cachedCategories && cachedCategories.length > 0) {
          setCategories(cachedCategories);
          console.log('Loaded categories from cache:', cachedCategories.length);
        }

        // Always fetch fresh data
        const res = await api.get("/category/all");
        const categoriesData = Array.isArray(res.data)
          ? res.data
          : (res.data?.data || res.data || []);
        
        // Only update if we got valid data
        if (Array.isArray(categoriesData) && categoriesData.length > 0) {
          setCategories(categoriesData);
          saveCategoriesToCache(categoriesData);
          console.log('Fetched fresh categories:', categoriesData.length);
        } else if (!categories.length && cachedCategories) {
          // If API returns empty but we have cache, keep cache
          console.log('API returned empty categories, keeping cached data');
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
        // If fetch fails and no categories set yet, try to use cache
        if (!categories.length) {
          const cachedCategories = loadCategoriesFromCache();
          if (cachedCategories) {
            setCategories(cachedCategories);
          }
        }
      }
    }
    
    if (!hasInitialized.current) {
      fetchCategories();
      hasInitialized.current = true;
    }
  }, []);

  // Initialize products from cache on first render
  useEffect(() => {
    if (!hasInitialized.current && categories.length > 0) {
      const cachedProducts = loadProductsFromCache();
      if (cachedProducts && cachedProducts.length > 0) {
        setAllProducts(cachedProducts);
        setIsUsingCache(true);
        setIsLoading(false);
        console.log('Initialized products from cache on mount:', cachedProducts.length);
      }
      hasInitialized.current = true;
    }
  }, [categories.length]);

  // Fetch products based on selected category with cache support
  const fetchProducts = useCallback(async (category: string, search: string, forceRefresh: boolean = false) => {
    if (isFetching.current) return;
    
    setIsLoading(true);
    setError(null);
    isFetching.current = true;
    
    try {
      // 1. If we are looking for "All" and have cache, use it immediately
      const isAll = category === t.all || category === "All" || category === "ទាំងអស់";
      
      if (!forceRefresh && isAll && !search.trim()) {
        const cached = loadProductsFromCache();
        if (cached) {
          setAllProducts(cached);
          setIsUsingCache(true);
          // If we have cache, we still fetch in the background to update, 
          // but we stop the loading spinner for better UX
          setIsLoading(false); 
        }
      }
  
      // 2. Build Request
      let url = "/product/all";
      const params = new URLSearchParams();
      if (!isAll) params.append('category', category);
      if (search.trim()) params.append('search', search);
      
      const res = await api.get(`${url}${params.toString() ? `?${params.toString()}` : ''}`);
      const productsData = res.data?.data || res.data || [];
  
      if (Array.isArray(productsData)) {
        setAllProducts(productsData);
        setIsUsingCache(false);
        
        // Update persistent cache only if it's the "All" list
        if (isAll && !search.trim()) {
          saveProductsToCache(productsData);
        }
      }
    } catch (err: any) {
      setError("Failed to sync products. Showing offline data.");
      const cached = loadProductsFromCache();
      if (cached) setAllProducts(cached);
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [t.all]);

  const filteredData = useMemo(() => {
    return allProducts.filter((item) => {
      // Category Filter
      const isAll = selectedCategory === t.all || selectedCategory === "All" || selectedCategory === "ទាំងអស់";
      const matchesCategory = isAll || item.product.category_name === selectedCategory; // Adjust property name to match your API
  
      // Search Filter
      const matchesSearch = item.product.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
  
      return matchesCategory && matchesSearch;
    });
  }, [allProducts, selectedCategory, searchQuery, t.all]);

  // Fetch all products on mount (after categories are loaded)
  useEffect(() => {
    if (categories.length > 0 && allProducts.length === 0 && !isUsingCache) {
      console.log('Initial fetch of all products');
      fetchProducts(t.all, "", false);
    }
  }, [categories.length, t.all, allProducts.length, isUsingCache, fetchProducts]);

  // Fetch products when category or search changes
  useEffect(() => {
    if (categories.length > 0 && selectedCategory) {
      const isSearching = searchQuery.trim().length > 0;
      const isAllCategory = selectedCategory === "All" || selectedCategory === "ទាំងអស់";
      
      // Don't fetch if we already have data and not searching
      if (!isSearching && !isAllCategory && categoryCache[selectedCategory]) {
        console.log(`Already have cached data for "${selectedCategory}", skipping fetch`);
        return;
      }
      
      console.log(`Fetching for category: "${selectedCategory}", search: "${searchQuery}"`);
      fetchProducts(selectedCategory, searchQuery, false);
    }
  }, [selectedCategory, searchQuery, categories.length, fetchProducts, categoryCache]);

  // Handle category selection
  const handleCategorySelect = (category: string) => {
    console.log(`Category selected: ${category}`);
    setSelectedCategory(category);
    // Clear search when changing categories
    setSearchQuery("");
  };

  // Handle manual refresh/retry
  const handleRefresh = () => {
    console.log('Manual refresh triggered');
    fetchProducts(selectedCategory, searchQuery, true);
  };

  console.log(`Current state: Category="${selectedCategory}", Search="${searchQuery}", Products=${allProducts.length}, UsingCache=${isUsingCache}`);

  return (
    <div className="flex flex-col flex-1 hide-scrollbar">
      {/* <RewardSection /> */}

      <div className="sticky top-0 z-20 bg-white">
        <div className="pb-2">
          <SearchBar onSearch={(value) => setSearchQuery(value)} />
        </div>
      </div>

      <div className="flex flex-1 overflow-y-auto">
        <Categories 
          selectedCategory={selectedCategory} 
          onSelect={handleCategorySelect} 
        />
        
        {/* Show loading state */}
        {isLoading ? (
          <div className="flex-1 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Loading Products...</h2>
              {isUsingCache && (
                <span className="text-sm text-green-600 bg-green-100 px-2 py-1 rounded">
                  Using cached data
                </span>
              )}
              <button
                onClick={clearCache}
                className="text-sm text-gray-500 hover:text-gray-700"
                title="Clear cache"
              >
                Clear Cache
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-200 h-48 rounded-lg"></div>
                  <div className="mt-2 h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="mt-1 h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <div className="text-red-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-700">{error}</h3>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={() => fetchProducts(selectedCategory, searchQuery, true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={clearCache}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            <div className="flex justify-between items-center p-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  Showing {allProducts.length} products
                  {selectedCategory !== "All" && selectedCategory !== "ទាំងអស់" && ` in "${selectedCategory}"`}
                  {searchQuery && ` matching "${searchQuery}"`}
                </span>
              </div>
            </div>
            <Products 
              selectedCategory={selectedCategory} 
              searchQuery={searchQuery}
              allProducts={allProducts}
              filteredProducts={filteredData}
            />
          </div>
        )}
      </div>
    </div>
  );
}