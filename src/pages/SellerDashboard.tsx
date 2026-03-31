import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Edit, Trash2, Eye, AlertTriangle, Smartphone, Headphones, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Product {
  id: string;
  title: string;
  price: number;
  status: string;
  created_at: string;
  views_count: number;
  images: Array<{ image_path: string; main_image: boolean }>;
  type: 'phone' | 'accessory';
}

const SellerDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [stats, setStats] = React.useState({
    total: 0,
    active: 0,
    pending: 0,
    rejected: 0
  });

  React.useEffect(() => {
    if (!user) return;
    fetchProducts();
  }, [user]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      if (!user) return;

      const fetchPhones = supabase
        .from('phones')
        .select('id, title, price, status, created_at, views_count, phone_images(image_path, main_image)')
        .eq('seller_id', user.id);

      const fetchAccessories = supabase
        .from('accessories')
        .select('id, title, price, status, created_at, views_count, accessory_images(image_path, main_image)')
        .eq('seller_id', user.id);

      const [
        { data: phonesData, error: phonesError },
        { data: accessoriesData, error: accessoriesError }
      ] = await Promise.all([fetchPhones, fetchAccessories]);

      if (phonesError) throw phonesError;
      if (accessoriesError) throw accessoriesError;

      const transformedPhones: Product[] = (phonesData || []).map(p => ({
        ...p,
        images: p.phone_images,
        type: 'phone'
      }));

      const transformedAccessories: Product[] = (accessoriesData || []).map(a => ({
        ...a,
        images: a.accessory_images,
        type: 'accessory'
      }));

      const allProducts = [...transformedPhones, ...transformedAccessories]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setProducts(allProducts);

      setStats({
        total: allProducts.length,
        active: allProducts.filter(p => p.status === 'active').length,
        pending: allProducts.filter(p => p.status === 'pending').length,
        rejected: allProducts.filter(p => p.status === 'rejected').length
      });

    } catch (error) {
      console.error('Error fetching phones:', error);
    } finally {
      setLoading(false);
    }
  };
  const fetchPhones = fetchProducts; // Alias for backward compatibility if needed

  const deleteProduct = async (id: string, type: 'phone' | 'accessory') => {
    if (!window.confirm(t('confirm_delete_ad'))) return;

    try {
      const tableName = type === 'phone' ? 'phones' : 'accessories';
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id)
        .eq('seller_id', user?.id);

      if (error) throw error;

      setProducts(products.filter(p => p.id !== id));
      // تحديث الإحصائيات
      const deletedProduct = products.find(p => p.id === id);
      if (deletedProduct) {
        setStats(prev => ({
          ...prev,
          total: prev.total - 1,
          active: deletedProduct.status === 'active' ? prev.active - 1 : prev.active,
          pending: deletedProduct.status === 'pending' ? prev.pending - 1 : prev.pending,
          rejected: deletedProduct.status === 'rejected' ? prev.rejected - 1 : prev.rejected
        }));
      }
    } catch (error) {
      console.error('Error deleting phone:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'rejected':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return t('active');
      case 'pending':
        return t('pending_review');
      case 'rejected':
        return t('rejected');
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 rounded-lg mb-4"></div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* رأس الصفحة */}
      <div className="flex justify-between items-center mb-6 mt-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard')}</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5 ml-2" />
          {t('add_new_ad')}
        </button>
      </div>


      {/* إحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">{t('total_ads')}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">{t('active_ads')}</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{stats.active}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">{t('pending_review')}</div>
          <div className="mt-1 text-2xl font-semibold text-yellow-600">{stats.pending}</div>
        </div>
      </div>

      {/* قائمة الهواتف */}
      <div className="bg-white shadow rounded-lg pb-10 mb-7">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('phone')}
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('price')}
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('status')}
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('publish_date')}
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">{t('edit')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0">
                        <img
                          className="h-10 w-10 rounded-lg object-cover"
                          src={product.images?.[0]?.image_path || '/placeholder-phone.png'}
                          alt={product.title}
                        />
                      </div>
                      <div className="mr-4">
                        <div className="text-sm font-medium text-gray-900">{product.title}</div>
                      </div>
                    </div>
                  </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{(product.price || 0).toLocaleString()} {t('currency')}</div>
                </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(product.status)}`}>
                      {getStatusText(product.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(product.created_at).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-3 gap-4">
                      <Link
                        to={`/product/${product.id}`} // الرابط صحيح بالفعل
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Eye className="h-5 w-5" />
                      </Link>
                      <Link
                        to={product.type === 'phone' ? `/edit-phone/${product.id}` : `/edit-accessory/${product.id}`}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        <Edit className="h-5 w-5" />
                      </Link>
                      <button
                        onClick={() => deleteProduct(product.id, product.type)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <AlertTriangle className="h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-lg font-medium mb-2">{t('no_ads_found')}</p>
                      <p className="text-sm">{t('add_first_phone')}</p>
                      <Link
                        to="/add-phone"
                        className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                      >
                        <Plus className="h-5 w-5 ml-2" />
                        {t('add_new_phone')}
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة الاختيار المنبثقة */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center transition-opacity duration-300"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white p-8 rounded-2xl shadow-2xl text-center w-full max-w-md transform transition-all duration-300 scale-95"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{t('what_to_add')}</h2>
            <div className="flex flex-col space-y-4">
              <Link
                to="/add-phone"
                className="flex items-center justify-center p-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-all duration-200 font-semibold text-lg"
              >
                <Smartphone className="ml-3" />
                {t('phone_for_sale')}
              </Link>
              <Link
                to="/add-accessories"
                className="flex items-center justify-center p-4 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-all duration-200 font-semibold text-lg"
              >
                <Headphones className="ml-3" />
                {t('accessory_for_sale')}
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SellerDashboard;
