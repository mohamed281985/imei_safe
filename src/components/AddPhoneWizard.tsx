import React, { useState } from 'react';
import AddPhoneStep1 from './AddPhoneStep1';
import AddPhoneStep2 from './AddPhoneStep2';
import AddPhoneStep3 from './AddPhoneStep3';
import AddPhoneStep4 from './AddPhoneStep4';

interface AddPhoneWizardProps {
  onComplete: () => void;
}

const AddPhoneWizard: React.FC<AddPhoneWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1
    storeName: '',
    phone: '',
    city: '',
    address: '',
    // Step 2
    brand: '',
    model: '',
    phoneType: '',
    price: '',
    condition: 'new' as 'new' | 'used' | 'refurbished',
    // Step 3
    ram: '',
    storage: '',
    color: '',
    warranty: '',
    // Step 4
    description: '',
    imei: '',
    images: [] as File[]
  });

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = () => {
    // حفظ البيانات للإكمال لاحقاً
    localStorage.setItem('addPhoneDraft', JSON.stringify(formData));
    alert('تم حفظ البيانات بنجاح!');
  };

  const updateFormData = (step: number, data: any) => {
    setFormData(prev => ({
      ...prev,
      ...data
    }));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <AddPhoneStep1 onNext={handleNext} onSave={handleSave} />;
      case 2:
        return <AddPhoneStep2 onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <AddPhoneStep3 onNext={handleNext} onBack={handleBack} />;
      case 4:
        return <AddPhoneStep4 onSubmit={onComplete} onBack={handleBack} />;
      default:
        return <AddPhoneStep1 onNext={handleNext} onSave={handleSave} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F9FF] to-[#DFF4FF]">
      {renderStep()}
    </div>
  );
};

export default AddPhoneWizard;
