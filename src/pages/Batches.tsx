import { useState, useEffect } from 'react';
import { Users, MapPin, BookOpen, Plus, Trash2, X } from 'lucide-react';
import type { Batch } from '../types';
import { initialBatches } from '../utils/seedData';

export default function Batches() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [newBatchName, setNewBatchName] = useState('');
  const [newRoom, setNewRoom] = useState('');
  
  // New state for dynamic subject pattern building
  const [currentSubject, setCurrentSubject] = useState('');
  const [pattern, setPattern] = useState<string[]>([]);

  useEffect(() => {
    const storedBatches = JSON.parse(localStorage.getItem('batches') || 'null');
    if (storedBatches) {
      setBatches(storedBatches);
    } else {
      setBatches(initialBatches);
      localStorage.setItem('batches', JSON.stringify(initialBatches));
    }
  }, []);

  // Helper to add a subject to the current pattern
  const handleAddSubject = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (currentSubject.trim() && !pattern.includes(currentSubject.trim())) {
      setPattern([...pattern, currentSubject.trim()]);
      setCurrentSubject('');
    }
  };

  // Helper to remove a subject from the pattern before saving
  const handleRemoveSubject = (subjectToRemove: string) => {
    setPattern(pattern.filter(sub => sub !== subjectToRemove));
  };

  const handleAddBatch = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate we have a name, room, and at least one subject
    if (!newBatchName.trim() || !newRoom.trim() || pattern.length === 0) return;

    const newBatch: Batch = {
      id: `b${Date.now()}`,
      name: newBatchName,
      roomNumber: newRoom,
      timetablePattern: pattern,
    };

    const updatedBatches = [...batches, newBatch];
    setBatches(updatedBatches);
    localStorage.setItem('batches', JSON.stringify(updatedBatches));
    
    // Reset form
    setNewBatchName('');
    setNewRoom('');
    setPattern([]);
  };

  const handleDelete = (idToDelete: string) => {
    const updatedBatches = batches.filter(b => b.id !== idToDelete);
    setBatches(updatedBatches);
    localStorage.setItem('batches', JSON.stringify(updatedBatches));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-3 border-b pb-4">
        <Users className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Batch Management</h1>
      </div>

      {/* Upgraded Add New Batch Form */}
      <form onSubmit={handleAddBatch} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name</label>
            <input
              type="text"
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              placeholder="e.g., Class 11 - Science"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
            <input
              type="text"
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              placeholder="e.g., 101"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Dynamic Pattern Builder */}
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">Subject Pattern Requirements</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={currentSubject}
              onChange={(e) => setCurrentSubject(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSubject(e)}
              placeholder="e.g., Mathematics"
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddSubject}
              className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
            >
              Add Subject
            </button>
          </div>
          
          {/* Tag rendering for selected subjects */}
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {pattern.length === 0 ? (
              <span className="text-sm text-gray-400 italic">No subjects added yet. Add at least one to save.</span>
            ) : (
              pattern.map((subject, idx) => (
                <span key={idx} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  {subject}
                  <button
                    type="button"
                    onClick={() => handleRemoveSubject(subject)}
                    className="text-blue-600 hover:text-blue-900 rounded-full hover:bg-blue-200 p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={!newBatchName.trim() || !newRoom.trim() || pattern.length === 0}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            Save New Batch
          </button>
        </div>
      </form>

      {/* Batches Grid (Remains the same structurally) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {batches.map((batch) => (
          <div key={batch.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-900">{batch.name}</h3>
              <button 
                onClick={() => handleDelete(batch.id)}
                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                title="Delete Batch"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3 text-sm text-gray-600 flex-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>Room: <span className="font-medium text-gray-900">{batch.roomNumber}</span></span>
              </div>
              <div className="flex items-start gap-2">
                <BookOpen className="w-4 h-4 text-gray-400 mt-0.5 min-w-[16px]" />
                <div className="flex flex-wrap gap-1">
                  {batch.timetablePattern?.map((subject, idx) => (
                    <span key={idx} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs border border-gray-200">
                      {subject}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}