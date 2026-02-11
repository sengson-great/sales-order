"use client";
import { useSearchParams } from "next/navigation";
import Icon from '@/components/Icon';
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";
import { toast } from "react-toastify";
import { useLanguage } from "@/context/LanguageContext";

const page = () => {
  const params = useSearchParams();
  const telegramLink = params.get("telegram");
  const orderId = params.get("order_id");
  const { user } = useAuth();
  const { t } = useLanguage();
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [addressDetails, setAddressDetails] = useState<any>(null);
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const hasSentRef = useRef(false);
  const isInitialMount = useRef(true);
  const [isSending, setIsSending] = useState(false);

  // Helper functions
  const safeNumber = (value: any): number => {
    if (value === null || value === undefined) return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  };

  const formatCurrency = (value: any): string => {
    return `$${safeNumber(value).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // Function to get address for display
  const getDisplayAddress = (orderData: any) => {
    if (!orderData) return null;
    
    // Check if we have address info from API
    if (orderData.address_info?.address && orderData.address_info.address.trim() !== '') {
      return orderData.address_info.address;
    }
    
    return null;
  };

  // Get address type for display
  const getAddressType = (orderData: any) => {
    if (!orderData || !orderData.address_info) return '';
    return orderData.address_info.type || '';
  };

/**
 * Generates a beautiful Khmer-style receipt image (PNG) as Data URL
 * @param orderData - The order details object from API
 * @param orderId - Order ID for header
 * @returns Promise<string> - resolves with data:image/png;base64,...
 */
const generateBoxImage = (orderData: any, orderId: string | number): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!orderData || !orderId) {
      return reject(new Error('Missing order data or ID'));
    }

    try {
      const scale = 2;              // Higher scale = sharper image
      const width = 384;            // Typical thermal printer width (~384px @ 2x)
      
      // Dynamic height calculation
      const baseHeight = 240;
      const itemsCount = orderData.items?.length || 0;
      const itemsHeight = itemsCount * 40; // ~40px per item line
      const addressHeight = orderData.address_info?.address ? 80 : 40;
      const totalHeight = baseHeight + itemsHeight + addressHeight + 120;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Cannot get canvas context'));

      canvas.width = width * scale;
      canvas.height = totalHeight * scale;
      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, totalHeight);

      // ────────────────────────────────────────────────
      // HEADER (blue bar + order info)
      // ────────────────────────────────────────────────
      ctx.fillStyle = '#1e4ce4'; // Blue header
      ctx.fillRect(0, 0, width, 80);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`លេខបង្កាន់ដៃ ${orderId}`, 20, 40); // Order #

      ctx.font = '14px Arial';
      ctx.fillText(formatDate(orderData.created_at), 20, 65);

      // ────────────────────────────────────────────────
      // CUSTOMER INFO
      // ────────────────────────────────────────────────
      let y = 110;

            // Add salesperson name if available
            if (orderData.salesperson_info?.name) {
              ctx.fillStyle = '#7c3aed'; // Purple color for salesperson
              ctx.font = 'bold 14px Arial';
              ctx.textAlign = 'left';
              ctx.fillText('អ្នកលក់ / Salesperson', 20, y);
              
              ctx.fillStyle = '#1e293b';
              ctx.font = '14px Arial';
              ctx.fillText(orderData.salesperson_info.name, 20, y + 20);
              y += 55;
            }

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('អតិថិជន / Customer', 20, y);
      y += 25;

      ctx.font = '14px Arial';
      ctx.fillText(orderData.customer_info?.name || 'អតិថិជន', 20, y);
      y += 20;

      if (orderData.customer_info?.phone) {
        ctx.fillText(`ទូរស័ព្ទ: ${orderData.customer_info.phone}`, 20, y);
        y += 25;
      }

      // Address
      const displayAddress = getDisplayAddress(orderData);
      if (displayAddress && displayAddress.trim() !== '') {
        ctx.font = 'bold 14px Arial';
        ctx.fillText('អាសយដ្ឋាន / Address', 20, y);
        y += 22;

        ctx.font = '12px Arial';
        ctx.fillStyle = '#475569';

        const maxWidth = width - 40;
        const lineHeight = 16;
        const words = displayAddress.split(' ');
        let line = '';
        let lineY = y;

        words.forEach((word: string) => {
          const testLine = line + word + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && line !== '') {
            ctx.fillText(line.trim(), 20, lineY);
            line = word + ' ';
            lineY += lineHeight;
          } else {
            line = testLine;
          }
        });
        if (line.trim()) {
          ctx.fillText(line.trim(), 20, lineY);
        }
        y = lineY + 30;
      }

      // ────────────────────────────────────────────────
      // ITEMS LIST
      // ────────────────────────────────────────────────
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('ទំនិញ / Items', 20, y);
      y += 25;

      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(20, y - 10);
      ctx.lineTo(width - 20, y - 10);
      ctx.stroke();
      y += 10;

      orderData.items?.forEach((item: any) => {
        ctx.font = '14px Arial';
        ctx.fillText(item.product_name || 'ផលិតផល', 20, y);
        
        ctx.textAlign = 'right';
        ctx.fillText(
          formatCurrency(safeNumber(item.qty) * safeNumber(item.price_at_order)),
          width - 20,
          y
        );

        ctx.textAlign = 'left';
        ctx.font = '12px Arial';
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${item.qty} × ${formatCurrency(item.price_at_order)}`, 20, y + 18);
        ctx.fillStyle = '#1e293b';
        y += 40;
      });

      // ────────────────────────────────────────────────
      // TOTAL SECTION
      // ────────────────────────────────────────────────
      y += 20;
      ctx.fillStyle = '#eff6ff';
      ctx.fillRect(0, y - 10, width, 80);

      ctx.fillStyle = '#1e4ce4';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('សរុប / Total', 20, y + 30);

      ctx.textAlign = 'right';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(formatCurrency(orderData.total), width - 20, y + 35);

      // Final Data URL
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      resolve(dataUrl);
    } catch (error) {
      reject(error);
    }
  });
};

const autoSendToTelegram = async (imageDataUrl: any) => {
  if (!orderId || !imageDataUrl) return;
  
  try {
    setIsSending(true);
    
    // Get token
    let token: string | null = null;
    const isSalesMode = user?.role === 'sale';
    
    if (isSalesMode) {
      token = localStorage.getItem('sales_token') || 
              localStorage.getItem('auth_token') || 
              sessionStorage.getItem('sales_token');
    } else {
      token = localStorage.getItem('auth_token') || 
              localStorage.getItem('token') || 
              sessionStorage.getItem('auth_token') ||
              sessionStorage.getItem('token');
    }
    
    if (!token) {
      toast.error("Please log in to send invoice");
      return;
    }
    
    // Convert Data URL to blob
    const blob = await (await fetch(imageDataUrl)).blob();
    const formData = new FormData();
    formData.append('invoice_image', blob, `លេខបង្កាន់ដៃ_${orderId}_បង្កាន់ដៃ.png`);
    formData.append('order_id', orderId.toString());
    
    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}/send-telegram-invoice`,
      formData,
      {
        withCredentials: true,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    
    if (response.data.success) {
      toast.success("Invoice sent to Telegram successfully!");
      console.log('✅ Telegram send successful');
    } else {
      toast.error(response.data.message || "Failed to send invoice");
      console.log('❌ Telegram send failed:', response.data.message);
    }
    
  } catch (error: any) {
    console.error('❌ Error sending invoice to Telegram:', error);
    
    // Don't reset hasSentRef on 500 error - it might have actually sent
    if (error.response?.status !== 500) {
      // Only reset for client errors (4xx), not server errors (5xx)
      hasSentRef.current = false;
    }
    
    if (error.response?.status === 500) {
      // Server error - might have sent successfully but server failed to respond
      toast.error("Invoice may have been sent (server error). Check Telegram.");
    } else {
      toast.error(error.response?.data?.message || "Error sending invoice");
    }
  } finally {
    setIsSending(false);
  }
};

useEffect(() => {
  console.log('🔍 useEffect triggered', {
    orderId,
    userRole: user?.role,
    hasSentRef: hasSentRef.current,
    isSalesMode: user?.role === 'sale'
  });

  const fetchOrderData = async () => {
    if (!orderId) {
      console.log('❌ No orderId, returning');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Get token based on auth type
      let token: string | null = null;
      const isSalesMode = user?.role === 'sale';
      
      console.log('🔍 Token check - isSalesMode:', isSalesMode);
      
      if (isSalesMode) {
        token = localStorage.getItem('sales_token') || 
                localStorage.getItem('auth_token') || 
                sessionStorage.getItem('sales_token');
      } else {
        token = localStorage.getItem('auth_token') || 
                localStorage.getItem('token') || 
                sessionStorage.getItem('auth_token') ||
                sessionStorage.getItem('token');
      }
      
      console.log('🔍 Token found:', !!token);
      
      if (!token) {
        toast.error("Please log in to view order details");
        return;
      }

      // Fetch order details
      console.log('🔍 Fetching order details...');
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/online-orders/${orderId}`, {
        withCredentials: true,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      console.log('🔍 Order API Response success:', res.data?.success);
      
      if (res.data?.success) {
        const orderData = res.data.data;
        setOrderDetails(orderData);

        // Generate image
        console.log('🔍 Generating invoice image...');
        const imageUrl = await generateBoxImage(orderData, orderId);
        setInvoiceImage(imageUrl);

        // ✅ Check conditions
        console.log('🔍 Auto-send conditions check:', {
          userRole: user?.role,
          isSales: user?.role === 'sale',
          hasSent: hasSentRef.current,
          imageUrlExists: !!imageUrl,
          shouldSend: user?.role === 'sale' && !hasSentRef.current && !!imageUrl
        });

        if (user?.role === 'sale' && !hasSentRef.current && imageUrl) {
          console.log('🚀 Auto-sending invoice to Telegram...');
          hasSentRef.current = true;
          
          // Try/catch the auto-send separately
          try {
            await autoSendToTelegram(imageUrl);
            console.log('✅ Auto-send completed');
          } catch (sendError) {
            console.error('❌ Auto-send failed:', sendError);
            hasSentRef.current = false; // Reset to allow retry
          }
        } else {
          console.log('⏭️ Auto-send skipped - conditions not met');
        }
      }
    } catch (err: any) {
      console.error("❌ Error fetching order details:", err);
      
      if (err.response?.status === 401) {
        toast.error("Session expired. Please log in again.");
      } else if (err.response?.status === 403) {
        toast.error("You don't have permission to view this order");
      } else if (err.response?.status === 404) {
        toast.error("Order not found");
      } else {
        toast.error(err.response?.data?.message || "Error fetching order details");
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  fetchOrderData();
}, [orderId, user?.role]);

  const handleDownload = () => {
    if (!invoiceImage) return;
    const a = document.createElement('a');
    a.href = invoiceImage;
    a.download = `លេខបង្កាន់ដៃ_${orderId}_បង្កាន់ដៃ.png`; // Receipt in Khmer
    a.click();
  };

  const handleShare = async () => {
    if (!invoiceImage) return;
    try {
      const blob = await (await fetch(invoiceImage)).blob();
      const file = new File([blob], `លេខបង្កាន់ដៃ_${orderId}_បង្កាន់ដៃ.png`, { type: 'image/png' });
      if (navigator.share) await navigator.share({ files: [file] });
      else handleDownload();
    } catch (e) { handleDownload(); }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Icon icon="mdi:loading" width={40} className="animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">កំពុងផ្ទុកព័ត៌មាន...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white p-4 border-b flex items-center gap-3">
        <button onClick={() => window.history.back()}><Icon icon="mdi:arrow-left" width={24}/></button>
        <h1 className="font-bold text-lg">បង្កាន់ដៃ</h1>
      </div>

      {orderDetails ? (
        <div className="p-4 max-w-md mx-auto">
          {/* THE MERGED BOX */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="p-5 bg-slate-50 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-blue-600 font-black text-xl">លេខបង្កាន់ដៃ #{orderId}</h2>
                  <p className="text-xs text-gray-500">{formatDate(orderDetails.created_at)}</p>
                  {user?.role === 'sale' && orderDetails.salesperson_info && (
                    <p className="text-xs text-gray-600 mt-1">
                      អ្នកលក់: {orderDetails.salesperson_info.name}
                    </p>
                  )}
                </div>
                <span className="bg-blue-600 text-white text-[10px] px-2 py-1 rounded-full font-bold">បង្កាន់ដៃ</span>
              </div>
            </div>

            <div className="p-5">
              {/* Customer Info Section */}
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">
                  {user?.role === 'sale' ? 'អតិថិជន' : 'ព័ត៌មានរបស់អ្នក'}
                </p>
                <p className="font-bold text-gray-800">
                  ឈ្មោះ​ {orderDetails.customer_info?.name || 'អតិថិជន'}
                </p>
                <p className="text-sm text-gray-600 mb-2">
                  លេខទូរសព្ទ {orderDetails.customer_info?.phone || 'N/A'}
                </p>
                
                {/* SIMPLE ADDRESS DISPLAY BELOW PHONE NUMBER */}
                {orderDetails.address_info?.address && orderDetails.address_info.address !== 'Address not specified' && (
                  <div className="mb-3 pb-3 border-b border-gray-100">
                    <p className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="text-gray-500 mt-0.5">អាសយដ្ឋាន</span>
                      <span className="flex-1">{orderDetails.address_info.address}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Order Items Section */}
              <div className="space-y-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">ទំនិញ</p>
                {orderDetails.items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-start border-b border-gray-50 pb-3 last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.qty} x {formatCurrency(item.price_at_order)}</p>
                    </div>
                    <p className="font-bold text-gray-900">{formatCurrency(item.qty * item.price_at_order)}</p>
                  </div>
                ))}
              </div>
              
              {/* Payment Method */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">ការទូទាត់</p>
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:credit-card-outline" className="text-gray-500" width={18} />
                  <p className="text-sm text-gray-800">
                    <span className="font-bold">
                      {orderDetails.payment_method === 'QR' ? 'QR' : 
                       orderDetails.payment_method === 'Cash' ? 'សាច់ប្រាក់' : 
                       orderDetails.payment_method === 'Card' ? 'ប័ណ្ណ' : 
                       orderDetails.payment_method || 'មិនមាន'}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Total Amount Section */}
            <div className="p-5 bg-blue-100 text-black">
              <div className="flex justify-between items-center">
                <span className="font-medium opacity-80">សរុប</span>
                <span className="text-2xl font-black">{formatCurrency(orderDetails.total)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50">
              <button 
                onClick={handleDownload}
                disabled={!invoiceImage || isGenerating}
                className={`flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-800 rounded-xl font-bold active:scale-95 transition-all shadow-sm ${(!invoiceImage || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isGenerating ? (
                  <>
                    <Icon icon="mdi:loading" className="animate-spin" width={20}/>
                    កំពុងបង្កើត...
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:download" width={20}/>
                    ទាញយក
                  </>
                )}
              </button>
              <button 
                onClick={handleShare}
                disabled={!invoiceImage || isGenerating}
                className={`flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl font-bold active:scale-95 transition-all shadow-sm ${(!invoiceImage || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon icon="mdi:share-variant" width={20}/>
                ចែករំលែក
              </button>
            </div>
          </div>
        </div>
      ) : !isLoading && (
        <div className="p-10 text-center">
          <Icon icon="mdi:file-document-outline" width={60} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">មិនមានបង្កាន់ដៃ</h3>
          <p className="text-gray-500 mb-6">
            យើងមិនអាចរកឃើញបង្កាន់ដៃលេខ #{orderId}
          </p>
          <a 
            href="/" 
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold"
          >
            ត្រឡប់ទៅផ្ទះ
          </a>
        </div>
      )}

      <div className="p-4 backdrop-blur-md border-t bg-white/95 flex gap-3">
        <a href="/" className="flex-1 py-3 bg-gray-100 text-center rounded-xl font-bold text-gray-700 hover:bg-gray-200 transition-colors">
          {t.home || 'ផ្ទះ'}
        </a>
        {telegramLink && (
          <a 
            href={telegramLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex-1 py-3 bg-blue-600 text-white text-center rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <Icon icon="mdi:telegram" width={20}/>
            Telegram
          </a>
        )}
      </div>
    </div>
  );
};

export default page;